"""Instance CRUD API routes."""

import logging

from fastapi import APIRouter, HTTPException

from instance_manager import InstanceManager, VLLMConfig
from schemas import CreateInstanceRequest
from websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)


def create_instances_router(manager: InstanceManager, ws_manager: WebSocketManager) -> APIRouter:
    router = APIRouter(tags=["instances"])

    @router.post("/api/instances")
    async def create_instance(req: CreateInstanceRequest):
        config = VLLMConfig(
            model=req.model,
            tensor_parallel_size=req.tensor_parallel_size,
            port=req.port,
            host=req.host,
            gpu_memory_utilization=req.gpu_memory_utilization,
            max_model_len=req.max_model_len,
            quantization=req.quantization,
            dtype=req.dtype,
            kv_cache_dtype=req.kv_cache_dtype,
            trust_remote_code=req.trust_remote_code,
            enforce_eager=req.enforce_eager,
            enable_chunked_prefill=req.enable_chunked_prefill,
            enable_auto_tool_choice=req.enable_auto_tool_choice,
            tool_call_parser=req.tool_call_parser,
            reasoning_parser=req.reasoning_parser,
            speculative_config=req.speculative_config,
            seed=req.seed,
            max_num_seqs=req.max_num_seqs,
            max_num_batched_tokens=req.max_num_batched_tokens,
            swap_space=req.swap_space,
            block_size=req.block_size,
            enable_prefix_caching=req.enable_prefix_caching,
            disable_log_stats=req.disable_log_stats,
            load_format=req.load_format,
            lora=req.lora,
            served_model_name=req.served_model_name,
            extra_args=req.extra_args,
            env_vars=req.env_vars,
        )

        instance_id = manager.create(config)

        instance = manager.get(instance_id)
        instance._log_callbacks.append(ws_manager.make_log_handler(instance_id, manager))
        instance._metrics_callbacks.append(ws_manager.make_metrics_handler(instance_id))

        ws_manager.get_log_buffer(instance_id)
        ws_manager.get_ws_clients(instance_id)

        success = await manager.start(instance_id)
        return {
            "instance_id": instance_id,
            "success": success,
            "status": instance.get_status(),
        }

    @router.get("/api/instances")
    async def list_instances():
        return [inst.get_status() for inst in manager.list_all()]

    @router.get("/api/instances/{instance_id}")
    async def get_instance(instance_id: str):
        try:
            instance = manager.get(instance_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Instance {instance_id} not found")
        return instance.get_status()

    @router.post("/api/instances/{instance_id}/stop")
    async def stop_instance(instance_id: str):
        try:
            await manager.stop(instance_id)
            instance = manager.get(instance_id)
            await ws_manager.broadcast_status(instance_id, instance.get_status())
            return {"success": True, "status": instance.get_status()}
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Instance {instance_id} not found")

    @router.post("/api/instances/{instance_id}/start")
    async def start_instance(instance_id: str):
        try:
            instance = manager.get(instance_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Instance {instance_id} not found")

        # Replace callbacks — clear old ones to prevent duplicates on restart or double-click
        instance._log_callbacks.clear()
        instance._metrics_callbacks.clear()
        instance._log_callbacks.append(ws_manager.make_log_handler(instance_id, manager))
        instance._metrics_callbacks.append(ws_manager.make_metrics_handler(instance_id))
        ws_manager.get_log_buffer(instance_id)
        ws_manager.get_ws_clients(instance_id)

        success = await manager.start(instance_id)
        if not success:
            raise HTTPException(status_code=400,
                                detail=f"Failed to start instance {instance_id}: {instance.last_error or 'unknown error'}")
        await ws_manager.broadcast_status(instance_id, instance.get_status())
        return {"success": True, "status": instance.get_status()}

    @router.delete("/api/instances/{instance_id}")
    async def delete_instance(instance_id: str):
        try:
            await manager.stop(instance_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Instance {instance_id} not found")

        ws_manager.remove_instance(instance_id)
        manager.remove(instance_id)
        return {"success": True}

    return router
