from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import json
from typing import Dict, Any, List
import logging

# カスタムモジュール（MediaPipeなしでテスト）
from config import config, Config
from instruction_parser import InstructionParser

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPIアプリケーション初期化
app = FastAPI(
    title=config.get("app_name", "CosmeticSim-MVP"),
    version=config.get("version", "0.1.0"),
    description="美容整形シミュレーションMVP - テストサーバー",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS設定
cors_origins = config.get("api.cors_origins", ["http://localhost:3000"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# テスト用のプロセッサー
instruction_parser = InstructionParser()

@app.get("/")
async def root():
    return {"message": "CosmeticSim-MVP Test Server", "status": "running", "version": config.get("version")}

@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    try:
        return {
            "status": "healthy",
            "processors": {
                "instruction_parser": True,
                "face_mesh": False,  # テスト用なので無効
                "mesh_editor": False,
                "nano_banana": False
            },
            "config": {
                "targets": config.get_targets(),
                "app_name": config.get("app_name"),
                "supported_targets": instruction_parser.get_supported_targets()
            }
        }
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {"status": "unhealthy", "error": str(e)}

@app.post("/edit/parse")
async def parse_edit_instruction(request: Dict[str, str]):
    """テキスト指示を正規化（テスト用）"""
    try:
        instruction = request.get("instruction", "")
        logger.info(f"Parsing instruction: {instruction}")
        
        operations = instruction_parser.parse_instruction(instruction)
        
        return JSONResponse({
            "instruction": instruction,
            "ops": operations,
            "supported_targets": instruction_parser.get_supported_targets(),
            "examples": instruction_parser.parse_examples()
        })
        
    except Exception as e:
        logger.error(f"Error parsing instruction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")

@app.get("/targets")
async def get_supported_targets():
    """サポートされている対象部位を取得"""
    return {
        "targets": instruction_parser.get_supported_targets(),
        "keywords": instruction_parser.get_target_keywords(),
        "examples": instruction_parser.parse_examples()
    }

@app.get("/config")
async def get_config():
    """設定情報を取得"""
    return {
        "app_name": config.get("app_name"),
        "version": config.get("version"),
        "targets": config.get_targets(),
        "assumptions": config.get_assumptions(),
        "limits": config.get_limits()
    }

@app.post("/test/instruction")
async def test_instruction(instruction: str):
    """指示解析のテストエンドポイント"""
    try:
        # 解析実行
        operations = instruction_parser.parse_instruction(instruction)
        
        # 詳細な解析結果
        result = {
            "input": instruction,
            "operations": operations,
            "operation_count": len(operations),
            "valid": len(operations) > 0
        }
        
        # 各操作の詳細
        for i, op in enumerate(operations):
            target = op["target"]
            result[f"operation_{i}"] = {
                "target": target,
                "delta_mm": op["delta_mm"],
                "action_type": op["action_type"],
                "radius_mm": op.get("radius_mm", 12.0),
                "sigma_mm": op.get("sigma_mm", 8.0),
                "max_delta": config.get_max_delta(target),
                "min_delta": config.get_min_delta(target),
                "is_valid_range": config.validate_delta(target, op["delta_mm"])
            }
        
        return JSONResponse(result)
        
    except Exception as e:
        logger.error(f"Error testing instruction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")

if __name__ == "__main__":
    api_config = config.get_api_config()
    uvicorn.run(
        "test_server:app", 
        host=api_config.get("host", "0.0.0.0"), 
        port=api_config.get("port", 8000), 
        reload=True
    )
