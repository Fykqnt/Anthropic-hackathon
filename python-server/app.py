from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import base64
import io
from PIL import Image
import numpy as np
import json
from typing import Dict, Any, List, Optional
import logging
import time
from pathlib import Path

# カスタムモジュール
from config import config, Config
from face_mesh import FaceMeshProcessor
from mesh_editor import MeshEditor
from nano_banana import NanoBananaProcessor
from instruction_parser import InstructionParser

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPIアプリケーション初期化
app = FastAPI(
    title=config.get("app_name", "CosmeticSim-MVP"),
    version=config.get("version", "0.1.0"),
    description="美容整形シミュレーションMVP - 複数部位対応",
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

# グローバルプロセッサーインスタンス（遅延初期化）
face_processor: Optional[FaceMeshProcessor] = None
mesh_editor: Optional[MeshEditor] = None
nano_processor: Optional[NanoBananaProcessor] = None
instruction_parser: Optional[InstructionParser] = None

def get_processors():
    """プロセッサーインスタンスを取得（依存性注入用）"""
    global face_processor, mesh_editor, nano_processor, instruction_parser
    
    if face_processor is None:
        face_processor = FaceMeshProcessor()
    if mesh_editor is None:
        mesh_editor = MeshEditor()
    if nano_processor is None:
        nano_processor = NanoBananaProcessor()
    if instruction_parser is None:
        instruction_parser = InstructionParser()
    
    return {
        "face_processor": face_processor,
        "mesh_editor": mesh_editor,
        "nano_processor": nano_processor,
        "instruction_parser": instruction_parser
    }

@app.get("/")
async def root():
    return {"message": "CosmeticSim-MVP API Server", "status": "running", "version": config.get("version")}

@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    try:
        processors = get_processors()
        return {
            "status": "healthy",
            "processors": {
                "face_mesh": processors["face_processor"].is_ready(),
                "mesh_editor": processors["mesh_editor"].is_ready(),
                "nano_banana": processors["nano_processor"].is_ready(),
                "instruction_parser": True
            },
            "config": {
                "targets": config.get_targets(),
                "app_name": config.get("app_name")
            }
        }
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {"status": "unhealthy", "error": str(e)}

@app.post("/analyze")
async def analyze_face(
    image: UploadFile = File(...),
    consent: bool = Form(False),
    px_per_mm: Optional[float] = Form(None),
    processors: Dict = Depends(get_processors)
):
    """画像からFaceMesh抽出＆事前計測"""
    try:
        if not consent:
            raise HTTPException(status_code=400, detail="Consent is required")
        
        # 画像の読み込み
        image_data = await image.read()
        pil_image = Image.open(io.BytesIO(image_data))
        
        logger.info(f"Analyzing image: {image.filename}, size: {pil_image.size}")
        
        # 3D Face Mesh構築
        face_mesh = await processors["face_processor"].build_mesh(pil_image)
        
        if not face_mesh:
            raise HTTPException(status_code=400, detail="Failed to detect face or build mesh")
        
        # メッシュデータを抽出
        landmarks = face_mesh.vertices.tolist()
        triangles = face_mesh.faces.tolist()
        
        # 事前計測（簡易版）
        metrics_before = {
            "nasal_tip_mm": 0.0,
            "nasal_bridge_mm": 0.0,
            "eye_size_ratio": 1.0,
            "jaw_width_mm": 0.0,
            "lip_thickness_mm": 0.0,
            "cheek_contour_mm": 0.0,
            "forehead_width_mm": 0.0
        }
        
        # px_per_mm推定（簡易版）
        estimated_px_per_mm = px_per_mm or 12.5  # デフォルト値
        
        return JSONResponse({
            "landmarks": landmarks,
            "triangles": triangles,
            "metrics_before": metrics_before,
            "px_per_mm": estimated_px_per_mm,
            "processing_time_ms": 0  # 実際の処理時間を測定
        })
        
    except Exception as e:
        logger.error(f"Error analyzing face: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/visualize-mesh")
async def visualize_mesh(
    image: UploadFile = File(...),
    consent: bool = Form(False),
    processors: Dict = Depends(get_processors)
):
    """3D Face Meshを画像として可視化"""
    try:
        if not consent:
            raise HTTPException(status_code=400, detail="Consent is required")
        
        # 画像の読み込み
        image_data = await image.read()
        pil_image = Image.open(io.BytesIO(image_data))
        
        logger.info(f"Visualizing mesh from image: {image.filename}, size: {pil_image.size}")
        
        # 3D Face Mesh構築
        face_mesh = await processors["face_processor"].build_mesh(pil_image)
        
        if not face_mesh:
            raise HTTPException(status_code=400, detail="Failed to detect face or build mesh")
        
        # メッシュを可視化
        mesh_image = processors["face_processor"].visualize_mesh(face_mesh, (800, 600))
        
        # 画像をbase64エンコード
        buffered = io.BytesIO()
        mesh_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        return JSONResponse({
            "success": True,
            "mesh_image": f"data:image/png;base64,{img_base64}",
            "mesh_info": {
                "vertices_count": len(face_mesh.vertices),
                "faces_count": len(face_mesh.faces),
                "original_image_size": pil_image.size
            }
        })
        
    except Exception as e:
        logger.error(f"Error visualizing mesh: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Mesh visualization failed: {str(e)}")

@app.post("/debug/face-detection")
async def debug_face_detection(
    image: UploadFile = File(...),
    consent: bool = Form(False),
    processors: Dict = Depends(get_processors)
):
    """顔検出のデバッグ情報を返す"""
    try:
        if not consent:
            raise HTTPException(status_code=400, detail="Consent is required")

        image_data = await image.read()
        pil_image = Image.open(io.BytesIO(image_data))

        logger.info(f"Debugging face detection from image: {image.filename}, size: {pil_image.size}")

        # MediaPipeで顔検出を直接テスト
        import cv2
        import numpy as np
        
        cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        results = processors["face_processor"].face_mesh.process(cv_image)
        
        face_detection_result = results.multi_face_landmarks[0] if results.multi_face_landmarks else None
        landmarks = face_detection_result
        
        return JSONResponse({
            "success": True,
            "face_detected": face_detection_result is not None,
            "landmarks_count": len(landmarks.landmark) if landmarks else 0,
            "image_size": pil_image.size,
            "face_detection_details": {
                "result": str(face_detection_result) if face_detection_result else None,
                "landmarks_sample": [
                    {"x": lm.x, "y": lm.y, "z": lm.z} 
                    for lm in landmarks.landmark[:5]  # 最初の5個のランドマーク
                ] if landmarks else []
            }
        })

    except Exception as e:
        logger.error(f"Error in face detection debug: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Face detection debug failed: {str(e)}")

@app.post("/edit/parse")
async def parse_edit_instruction(
    instruction: str,
    processors: Dict = Depends(get_processors)
):
    """テキスト指示を正規化"""
    try:
        logger.info(f"Parsing instruction: {instruction}")
        
        operations = processors["instruction_parser"].parse_instruction(instruction)
        
        return JSONResponse({
            "ops": operations
        })
        
    except Exception as e:
        logger.error(f"Error parsing instruction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")

@app.post("/mesh/deform")
async def deform_mesh(
    landmarks: List[List[float]],
    triangles: List[List[int]],
    ops: List[Dict[str, Any]],
    px_per_mm: float,
    processors: Dict = Depends(get_processors)
):
    """メッシュ幾何変形"""
    try:
        logger.info(f"Deforming mesh with {len(ops)} operations")
        
        # メッシュを再構築
        import trimesh
        mesh = trimesh.Trimesh(vertices=np.array(landmarks), faces=np.array(triangles))
        
        # 各操作を適用
        edited_mesh = mesh
        for op in ops:
            edited_mesh = await processors["mesh_editor"].edit_mesh(edited_mesh, op, {})
        
        # 結果を返す
        mesh_after = {
            "vertices": edited_mesh.vertices.tolist(),
            "faces": edited_mesh.faces.tolist()
        }
        
        metrics_after = {
            "nasal_tip_mm": 0.0,  # 実際の計測値
            "nasal_bridge_mm": 0.0,
            "eye_size_ratio": 1.0,
            "jaw_width_mm": 0.0,
            "lip_thickness_mm": 0.0,
            "cheek_contour_mm": 0.0,
            "forehead_width_mm": 0.0
        }
        
        return JSONResponse({
            "mesh_after": mesh_after,
            "metrics_after": metrics_after,
            "processing_time_ms": 0
        })
        
    except Exception as e:
        logger.error(f"Error deforming mesh: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Mesh deformation failed: {str(e)}")

@app.post("/guides")
async def generate_guides(
    mesh_after: Dict[str, Any],
    mesh_before: Optional[Dict[str, Any]] = None,
    render_px: int = 1024,
    processors: Dict = Depends(get_processors)
):
    """Depth/Normal/Displacement/Mask生成"""
    try:
        logger.info(f"Generating guides at {render_px}px resolution")
        
        # 簡易的なガイド画像生成（実際の実装では3Dレンダリング）
        dummy_image = Image.new('RGB', (render_px, render_px), (128, 128, 128))
        
        # base64エンコード
        buffered = io.BytesIO()
        dummy_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        return JSONResponse({
            "depth_png": img_base64,
            "normal_png": img_base64,
            "disp_png": img_base64,
            "mask_png": img_base64
        })
        
    except Exception as e:
        logger.error(f"Error generating guides: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Guide generation failed: {str(e)}")

@app.post("/image/compose")
async def compose_image(
    original_image_url: str,
    guides: Dict[str, str],
    prompt: str,
    strength_schedule: List[float] = [1.0, 0.7, 0.5],
    processors: Dict = Depends(get_processors)
):
    """nano banana でAfter生成"""
    try:
        logger.info(f"Composing image with prompt: {prompt[:50]}...")
        
        # 簡易的な画像合成（実際の実装ではnano banana API呼び出し）
        dummy_image = Image.new('RGB', (1024, 1024), (255, 255, 255))
        
        # base64エンコード
        buffered = io.BytesIO()
        dummy_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        return JSONResponse({
            "after_image_url": f"data:image/png;base64,{img_base64}",
            "params_json_url": None,
            "face_glb_url": None,
            "processing_time_ms": 0,
            "nano_banana_attempts": 1
        })
        
    except Exception as e:
        logger.error(f"Error composing image: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Image composition failed: {str(e)}")

@app.post("/process-face-mesh")
async def process_face_mesh(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    surgery_params: str = Form(default="{}"),
    processors: Dict = Depends(get_processors)
):
    """統合処理エンドポイント（既存のNext.js APIとの互換性）"""
    try:
        # 画像の読み込み
        image_data = await image.read()
        pil_image = Image.open(io.BytesIO(image_data))
        
        # JSON形式の手術パラメータをパース
        try:
            surgery_dict = json.loads(surgery_params)
        except json.JSONDecodeError:
            surgery_dict = {}
        
        logger.info(f"Processing image: {image.filename}, prompt: {prompt[:50]}...")
        
        # Step 1: 3D Face Mesh構築
        logger.info("Step 1: Building 3D face mesh...")
        face_mesh = await processors["face_processor"].build_mesh(pil_image)
        
        if not face_mesh:
            raise HTTPException(status_code=400, detail="Failed to detect face or build mesh")
        
        # Step 2: プロンプト解析
        logger.info("Step 2: Parsing prompt...")
        operations = processors["instruction_parser"].parse_instruction(prompt)
        
        # Step 3: メッシュ編集
        logger.info("Step 3: Editing mesh...")
        edited_mesh = face_mesh
        for operation in operations:
            edited_mesh = await processors["mesh_editor"].edit_mesh(edited_mesh, operation, surgery_dict)
        
        # Step 4: 画像生成（簡易版）
        logger.info("Step 4: Generating final image...")
        result_image = await processors["nano_processor"].generate_image(edited_mesh, pil_image)
        
        # 結果をbase64エンコードして返却
        buffered = io.BytesIO()
        result_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        return JSONResponse({
            "success": True,
            "image": f"data:image/png;base64,{img_base64}",
            "processing_info": {
                "original_size": pil_image.size,
                "mesh_vertices": len(face_mesh.vertices) if face_mesh else 0,
                "edited_features": list(surgery_dict.keys()) if surgery_dict else [],
                "operations_applied": len(operations)
            }
        })
        
    except Exception as e:
        logger.error(f"Error processing face mesh: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

if __name__ == "__main__":
    api_config = config.get_api_config()
    uvicorn.run(
        "app:app", 
        host=api_config.get("host", "0.0.0.0"), 
        port=api_config.get("port", 8000), 
        reload=True
    )
