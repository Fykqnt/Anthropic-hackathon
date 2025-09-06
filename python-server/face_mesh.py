import cv2
import numpy as np
from PIL import Image
import mediapipe as mp
import trimesh
from typing import Optional, Dict, Any, Tuple, List
import logging
import io
import matplotlib.pyplot as plt

logger = logging.getLogger(__name__)

class FaceMeshProcessor:
    def __init__(self):
        """3D face mesh処理クラス"""
        self.mp_face_mesh = mp.solutions.face_mesh
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        # Face mesh初期化（横顔・斜め顔にも対応）
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.3,  # 検出感度を上げる
            min_tracking_confidence=0.3
        )
        
        logger.info("FaceMeshProcessor initialized")
    
    def is_ready(self) -> bool:
        """プロセッサーが準備完了かチェック"""
        return self.face_mesh is not None
    
    async def build_mesh(self, pil_image: Image.Image) -> Optional[trimesh.Trimesh]:
        """
        PIL画像から3D face meshを構築（正面・横顔・斜め顔に対応）
        
        Args:
            pil_image: PIL画像オブジェクト
            
        Returns:
            trimesh.Trimesh: 3Dメッシュオブジェクト
        """
        try:
            # PIL画像をOpenCV形式に変換
            cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            
            # 顔の向きを検出
            face_orientation = self._detect_face_orientation(cv_image)
            logger.info(f"Detected face orientation: {face_orientation}")
            
            # MediaPipeで顔のランドマーク検出
            results = self.face_mesh.process(cv_image)
            
            if not results.multi_face_landmarks:
                logger.warning("No face landmarks detected")
                return None
            
            # 最初の顔のランドマークを取得
            face_landmarks = results.multi_face_landmarks[0]
            
            # 3Dメッシュに変換（顔の向きを考慮）
            mesh = self._landmarks_to_mesh(face_landmarks, cv_image.shape, face_orientation)
            
            logger.info(f"Successfully built 3D mesh with {len(mesh.vertices)} vertices for {face_orientation} face")
            return mesh
            
        except Exception as e:
            logger.error(f"Error building mesh: {str(e)}")
            return None
    
    def _detect_face_orientation(self, cv_image) -> str:
        """顔の向きを検出"""
        try:
            # 簡易的な顔の向き検出
            # 左右の目の位置を比較して判定
            results = self.face_mesh.process(cv_image)
            if not results.multi_face_landmarks:
                return "unknown"
            
            landmarks = results.multi_face_landmarks[0]
            
            # 左右の目の中心点を取得
            left_eye_center = np.mean([
                [landmarks.landmark[33].x, landmarks.landmark[33].y],
                [landmarks.landmark[7].x, landmarks.landmark[7].y],
                [landmarks.landmark[163].x, landmarks.landmark[163].y],
                [landmarks.landmark[144].x, landmarks.landmark[144].y]
            ], axis=0)
            
            right_eye_center = np.mean([
                [landmarks.landmark[362].x, landmarks.landmark[362].y],
                [landmarks.landmark[382].x, landmarks.landmark[382].y],
                [landmarks.landmark[380].x, landmarks.landmark[380].y],
                [landmarks.landmark[374].x, landmarks.landmark[374].y]
            ], axis=0)
            
            # 目の位置差から向きを判定
            eye_diff = left_eye_center[0] - right_eye_center[0]
            
            if abs(eye_diff) < 0.1:
                return "front"  # 正面
            elif eye_diff > 0.1:
                return "left"   # 左向き
            else:
                return "right"  # 右向き
                
        except Exception as e:
            logger.warning(f"Error detecting face orientation: {str(e)}")
            return "unknown"
    
    def _landmarks_to_mesh(self, landmarks, image_shape: Tuple[int, int, int], face_orientation: str = "front") -> trimesh.Trimesh:
        """
        顔のランドマークから3Dメッシュを生成（顔の向きを考慮）
        
        Args:
            landmarks: MediaPipeの顔ランドマーク
            image_shape: 画像の形状 (height, width, channels)
            face_orientation: 顔の向き ("front", "left", "right", "unknown")
            
        Returns:
            trimesh.Trimesh: 3Dメッシュ
        """
        height, width = image_shape[:2]
        
        # ランドマークを3D座標に変換（顔の向きを考慮）
        vertices = []
        for landmark in landmarks.landmark:
            # 正規化座標を実際のピクセル座標に変換
            x = landmark.x * width
            y = landmark.y * height
            z = landmark.z * width  # Z座標もスケール調整
            
            # 顔の向きに応じて座標を調整
            if face_orientation == "left":
                # 左向きの場合、Z座標を調整
                z = z * 0.5  # 奥行きを浅くする
            elif face_orientation == "right":
                # 右向きの場合、Z座標を調整
                z = z * 0.5  # 奥行きを浅くする
            
            vertices.append([x, y, z])
        
        vertices = np.array(vertices)
        
        # より効率的な面生成：Delaunay三角分割を使用
        faces = self._generate_triangular_faces(vertices)
        
        # trimeshオブジェクトを作成
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
        
        # メッシュを正規化（原点中心、単位スケール）
        mesh.vertices -= mesh.vertices.mean(axis=0)
        mesh.vertices /= np.linalg.norm(mesh.vertices, axis=1).max()
        
        return mesh
    
    def _generate_triangular_faces(self, vertices: np.ndarray) -> List[List[int]]:
        """Delaunay三角分割を使用して面を生成"""
        try:
            from scipy.spatial import Delaunay
            
            # 2D投影で三角分割を実行（Z座標を無視）
            points_2d = vertices[:, :2]  # X, Y座標のみ使用
            
            # Delaunay三角分割
            tri = Delaunay(points_2d)
            
            # 三角形の面を生成
            faces = tri.simplices.tolist()
            
            logger.info(f"Generated {len(faces)} triangular faces using Delaunay triangulation")
            return faces
            
        except ImportError:
            logger.warning("scipy not available, using simple face generation")
            return self._generate_simple_faces(vertices)
    
    def _generate_simple_faces(self, vertices: np.ndarray) -> List[List[int]]:
        """簡易的な面を生成（Delaunay三角分割の代替）"""
        faces = []
        n_vertices = len(vertices)
        
        # 顔の主要な部分の面を手動で定義
        # これは簡易版なので、実際の顔の構造に基づいていません
        
        # 鼻の部分
        if n_vertices > 20:
            faces.extend([
                [1, 2, 3], [2, 3, 4], [3, 4, 5],
                [4, 5, 6], [5, 6, 7], [6, 7, 8]
            ])
        
        # 目の周り
        if n_vertices > 50:
            faces.extend([
                [33, 7, 163], [7, 163, 144], [163, 144, 145],
                [144, 145, 153], [145, 153, 154], [153, 154, 155]
            ])
        
        # 口の周り
        if n_vertices > 100:
            faces.extend([
                [61, 84, 17], [84, 17, 18], [17, 18, 19],
                [18, 19, 20], [19, 20, 21], [20, 21, 22]
            ])
        
        # 面の頂点インデックスが有効かチェック
        valid_faces = []
        for face in faces:
            if all(0 <= idx < n_vertices for idx in face):
                valid_faces.append(face)
        
        return valid_faces
    


    def visualize_mesh(self, mesh, canvas_size=(800, 600), draw_indices=True, use_faces=True):
        """
        2D 正射影でワイヤーフレームを描く。
        - mesh.vertices: (N,3)
        - mesh.faces: (M,3) があるなら三角形で描く。無ければ既定の接続で線分描画。
        """
        W, H = canvas_size

        verts = np.asarray(mesh.vertices)  # (N,3)
        x = verts[:, 0]
        y = verts[:, 1]

        # 画像座標系に合わせてYを反転（上が0）
        # もし x,y が 0..1 正規化ならこのままスケール、そうでない場合は min-max 正規化
        def _minmax(v):
            vmin, vmax = float(v.min()), float(v.max())
            return (v - vmin) / max(1e-8, (vmax - vmin))
         # 正規化チェック（0..1 に収まっていなければ正規化してしまう）
        if not (0.0 <= x.min() and x.max() <= 1.0 and 0.0 <= y.min() and y.max() <= 1.0):
            x = _minmax(x)
            y = _minmax(y)
        Xp = x * W
        # Y座標を正しく変換：MediaPipeは画像座標系（上が0）でランドマークを返す
        # matplotlibで保存する時は上下反転が必要
        Yp = H - (y * H)  # 上下反転を適用
        fig = plt.figure(figsize=(W/100.0, H/100.0), dpi=100)
        ax = plt.gca()
        ax.set_xlim(0, W)
        ax.set_ylim(0, H)  # matplotlibの標準座標系（下が0、上がH）
        ax.axis('off')

        if use_faces and hasattr(mesh, "faces") and mesh.faces is not None and len(mesh.faces) > 0:
            # 三角形でワイヤーフレーム
            import matplotlib.tri as mtri
            triang = mtri.Triangulation(Xp, Yp, triangles=mesh.faces)
            ax.triplot(triang, linewidth=0.4)
        else:
            # 既定の接続で線分を描く（MediaPipe の接続を利用）
            try:
                from mediapipe.python.solutions.face_mesh_connections import FACEMESH_TESSELATION
                for (i, j) in FACEMESH_TESSELATION:
                    ax.plot([Xp[i], Xp[j]], [Yp[i], Yp[j]], linewidth=0.2)
            except Exception:
                # 接続が無い場合は点だけ
                pass

        # 点を薄く重ねる
        ax.scatter(Xp, Yp, s=5, c='blue', alpha=0.6)

        # インデックス表示（小さく）
        if draw_indices:
            for idx, (xx, yy) in enumerate(zip(Xp, Yp)):
                ax.text(xx, yy, str(idx), fontsize=4)

        # 画像として返す
        buf = io.BytesIO()
        plt.tight_layout(pad=0)
        fig.canvas.draw()
        fig.savefig(buf, format='png', bbox_inches='tight', pad_inches=0)
        plt.close(fig)
        buf.seek(0)
        return Image.open(buf)    
    
    def _create_simple_mesh_visualization(self, mesh: trimesh.Trimesh, image_size: Tuple[int, int]) -> Image.Image:
        """matplotlibがない場合の簡易メッシュ可視化"""
        width, height = image_size
        
        # 空白画像を作成
        img = Image.new('RGB', (width, height), (255, 255, 255))
        
        # メッシュの頂点を2Dに投影
        vertices = mesh.vertices
        
        # 正規化（-1 to 1 の範囲）
        vertices_2d = vertices[:, :2].copy()
        vertices_2d[:, 0] = (vertices_2d[:, 0] - vertices_2d[:, 0].min()) / (vertices_2d[:, 0].max() - vertices_2d[:, 0].min()) * 2 - 1
        vertices_2d[:, 1] = (vertices_2d[:, 1] - vertices_2d[:, 1].min()) / (vertices_2d[:, 1].max() - vertices_2d[:, 1].min()) * 2 - 1
        
        # 画像座標に変換
        vertices_2d[:, 0] = (vertices_2d[:, 0] + 1) * width / 2
        vertices_2d[:, 1] = (vertices_2d[:, 1] + 1) * height / 2
        
        # 簡易的な描画（OpenCVを使用）
        try:
            import cv2
            img_array = np.array(img)
            
            # 各頂点を描画
            for vertex in vertices_2d:
                x, y = int(vertex[0]), int(vertex[1])
                if 0 <= x < width and 0 <= y < height:
                    cv2.circle(img_array, (x, y), 1, (0, 0, 255), -1)
            
            return Image.fromarray(img_array)
            
        except ImportError:
            # OpenCVもない場合は、最もシンプルな画像を返す
            return img
    
    async def analyze_face(self, pil_image: Image.Image) -> Dict[str, Any]:
        """
        顔の特徴を分析
        
        Args:
            pil_image: PIL画像オブジェクト
            
        Returns:
            Dict: 顔の分析結果
        """
        try:
            cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            results = self.face_mesh.process(cv_image)
            
            if not results.multi_face_landmarks:
                return {"error": "No face detected"}
            
            face_landmarks = results.multi_face_landmarks[0]
            
            # 基本的な顔の特徴を計算
            analysis = {
                "face_detected": True,
                "landmark_count": len(face_landmarks.landmark),
                "image_size": pil_image.size,
                "confidence": "high"  # MediaPipeの信頼度情報があれば使用
            }
            
            # 顔の向きや表情の分析（簡易版）
            # 実際の実装では、より詳細な分析を行う
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing face: {str(e)}")
            return {"error": str(e)}
    
    def get_face_regions(self, landmarks) -> Dict[str, list]:
        """
        顔の各部位のランドマークインデックスを取得
        
        Returns:
            Dict: 各部位のランドマークインデックス
        """
        # MediaPipeの顔の部位定義を使用
        regions = {
            "face_oval": list(range(10, 17)) + list(range(17, 22)) + list(range(22, 27)),
            "left_eye": list(range(33, 42)),
            "right_eye": list(range(362, 373)),
            "nose": list(range(1, 10)),
            "mouth": list(range(61, 84)),
            "left_eyebrow": list(range(70, 76)),
            "right_eyebrow": list(range(300, 307))
        }
        
        return regions
