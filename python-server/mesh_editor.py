import numpy as np
import trimesh
from typing import Dict, Any, Optional
import logging
import json

logger = logging.getLogger(__name__)

class MeshEditor:
    def __init__(self):
        """3Dメッシュ編集クラス"""
        self.editing_operations = {
            "鼻を高く": self._edit_nose_height,
            "目を大きく": self._edit_eye_size,
            "顎を細く": self._edit_jaw_width,
            "唇を厚く": self._edit_lip_thickness,
            "頬を引き締める": self._edit_cheek_contour,
            "額を広く": self._edit_forehead_width
        }
        
        # 顔の部位のランドマークインデックス（簡易版）
        self.face_regions = self._define_face_regions()
        
        logger.info("MeshEditor initialized")
    
    def is_ready(self) -> bool:
        """エディターが準備完了かチェック"""
        return True
    
    def _define_face_regions(self) -> Dict[str, list]:
        """顔の部位のランドマークインデックスを定義"""
        # MediaPipeの468個のランドマークから主要な部位を定義
        # 実際の実装では、より正確な部位定義を使用
        return {
            "nose_tip": list(range(1, 10)),           # 鼻先
            "nose_bridge": list(range(168, 175)),     # 鼻筋
            "left_eye": list(range(33, 42)),          # 左目
            "right_eye": list(range(362, 373)),       # 右目
            "left_eyebrow": list(range(70, 76)),      # 左眉毛
            "right_eyebrow": list(range(300, 307)),   # 右眉毛
            "mouth_outer": list(range(61, 84)),       # 口の外側
            "mouth_inner": list(range(78, 95)),       # 口の内側
            "jaw_line": list(range(172, 199)),        # 顎のライン
            "left_cheek": list(range(116, 140)),      # 左頬
            "right_cheek": list(range(345, 359)),     # 右頬
            "forehead": list(range(10, 22)),          # 額
            "chin": list(range(175, 185))             # 顎先
        }
    
    async def edit_mesh(self, mesh: trimesh.Trimesh, operations: list) -> trimesh.Trimesh:
        """
        編集操作のリストに基づいてメッシュを編集
        
        Args:
            mesh: 元の3Dメッシュ
            operations: 編集操作のリスト [{"target": "nasal_tip_mm", "action": "increase", "value": 1.8}]
            
        Returns:
            trimesh.Trimesh: 編集された3Dメッシュ
        """
        try:
            # メッシュのコピーを作成
            edited_mesh = mesh.copy()
            
            # 各操作を順次適用
            for operation in operations:
                edited_mesh = self._apply_operation(edited_mesh, operation)
                logger.info(f"Applied operation: {operation}")
            
            return edited_mesh
            
        except Exception as e:
            logger.error(f"Error editing mesh: {str(e)}")
            return mesh
    
    def _apply_operation(self, mesh: trimesh.Trimesh, operation: dict) -> trimesh.Trimesh:
        """個別の操作を適用"""
        try:
            target = operation.get("target")
            action = operation.get("action_type", operation.get("action"))
            value = operation.get("delta_mm", operation.get("value", 0))
            
            # 現実的な範囲に制限
            value = self._clamp_value(target, value)
            
            logger.info(f"Applying operation: target={target}, action={action}, value={value}")
            
            if target == "nasal_tip_mm":
                return self._deform_nose_tip(mesh, value)
            elif target == "nasal_bridge_mm":
                return self._deform_nose_bridge(mesh, value)
            elif target == "eye_size_ratio":
                return self._deform_eye_size(mesh, value)
            elif target == "jaw_width_mm":
                return self._deform_jaw_width(mesh, value)
            elif target == "lip_thickness_mm":
                return self._deform_lip_thickness(mesh, value)
            elif target == "cheek_contour_mm":
                return self._deform_cheek_contour(mesh, value)
            elif target == "forehead_width_mm":
                return self._deform_forehead_width(mesh, value)
            else:
                logger.warning(f"Unknown target: {target}")
                return mesh
        except Exception as e:
            logger.error(f"Error applying operation {operation}: {str(e)}")
            return mesh
    
    
    def _clamp_value(self, target: str, value: float) -> float:
        """現実的な範囲に値を制限"""
        # 各部位の現実的な変形範囲（mm）
        limits = {
            "nasal_tip_mm": (-1.0, 1.0),  # より小さな範囲に制限
            "nasal_bridge_mm": (-1.0, 1.0),
            "eye_size_ratio": (-0.1, 0.1),
            "jaw_width_mm": (-2.0, 2.0),
            "lip_thickness_mm": (-1.0, 1.0),
            "cheek_contour_mm": (-1.5, 1.5),
            "forehead_width_mm": (-1.5, 1.5)
        }
        
        if target in limits:
            min_val, max_val = limits[target]
            clamped_value = max(min_val, min(max_val, value))
            if clamped_value != value:
                logger.warning(f"Value {value} clamped to {clamped_value} for {target}")
            return clamped_value
        
        return value
    
    def _parse_prompt(self, prompt: str) -> Dict[str, float]:
        """
        プロンプトから編集操作と強度を抽出
        
        Args:
            prompt: 編集指示のプロンプト
            
        Returns:
            Dict: 編集操作と強度の辞書
        """
        operations = {}
        
        # 日本語の美容整形関連キーワードを検出
        prompt_lower = prompt.lower()
        
        # 各編集操作のキーワードをチェック
        if "鼻" in prompt_lower and ("高く" in prompt_lower or "高" in prompt_lower):
            operations["鼻を高く"] = self._extract_intensity(prompt, "鼻")
        
        if "目" in prompt_lower and ("大きく" in prompt_lower or "大" in prompt_lower):
            operations["目を大きく"] = self._extract_intensity(prompt, "目")
        
        if "顎" in prompt_lower and ("細く" in prompt_lower or "細" in prompt_lower):
            operations["顎を細く"] = self._extract_intensity(prompt, "顎")
        
        if "唇" in prompt_lower and ("厚く" in prompt_lower or "厚" in prompt_lower):
            operations["唇を厚く"] = self._extract_intensity(prompt, "唇")
        
        if "頬" in prompt_lower and ("引き締め" in prompt_lower):
            operations["頬を引き締める"] = self._extract_intensity(prompt, "頬")
        
        if "額" in prompt_lower and ("広く" in prompt_lower or "広" in prompt_lower):
            operations["額を広く"] = self._extract_intensity(prompt, "額")
        
        return operations
    
    def _extract_intensity(self, prompt: str, keyword: str) -> float:
        """
        プロンプトから強度を抽出
        
        Args:
            prompt: プロンプト
            keyword: キーワード
            
        Returns:
            float: 強度（0-1の範囲）
        """
        # 数字を探す（簡易版）
        import re
        numbers = re.findall(r'\d+', prompt)
        
        if numbers:
            # 最初に見つかった数字を使用
            intensity = float(numbers[0]) / 10.0  # 0-10を0-1に正規化
            return max(0.0, min(1.0, intensity))
        
        # 数字が見つからない場合は、キーワードの前後から推測
        if "少し" in prompt or "軽く" in prompt:
            return 0.3
        elif "かなり" in prompt or "強く" in prompt:
            return 0.8
        else:
            return 0.5  # デフォルト強度
    
    def _deform_nose_tip(self, mesh: trimesh.Trimesh, value: float) -> trimesh.Trimesh:
        """鼻尖を変形"""
        return self._deform_region(mesh, "nose_tip", [0, 0, value])  # Z軸方向（前後）に変形
    
    def _deform_nose_bridge(self, mesh: trimesh.Trimesh, value: float) -> trimesh.Trimesh:
        """鼻筋を変形"""
        return self._deform_region(mesh, "nose_bridge", [0, value, 0])
    
    def _deform_eye_size(self, mesh: trimesh.Trimesh, value: float) -> trimesh.Trimesh:
        """目のサイズを変形（スケール）"""
        # 両目を中心から外側に拡張
        left_eye_mesh = self._deform_region(mesh, "left_eye", [value, 0, 0])
        return self._deform_region(left_eye_mesh, "right_eye", [-value, 0, 0])
    
    def _deform_jaw_width(self, mesh: trimesh.Trimesh, value: float) -> trimesh.Trimesh:
        """顎の幅を変形"""
        return self._deform_region(mesh, "jaw_line", [value, 0, 0])
    
    def _deform_lip_thickness(self, mesh: trimesh.Trimesh, value: float) -> trimesh.Trimesh:
        """唇の厚さを変形"""
        return self._deform_region(mesh, "mouth_outer", [0, 0, value])  # Z軸方向に変形
    
    def _deform_cheek_contour(self, mesh: trimesh.Trimesh, value: float) -> trimesh.Trimesh:
        """頬の輪郭を変形"""
        left_cheek = self._deform_region(mesh, "left_cheek", [value, 0, 0])
        return self._deform_region(left_cheek, "right_cheek", [-value, 0, 0])
    
    def _deform_forehead_width(self, mesh: trimesh.Trimesh, value: float) -> trimesh.Trimesh:
        """額の幅を変形"""
        return self._deform_region(mesh, "forehead", [value, 0, 0])
    
    def _deform_region(self, mesh: trimesh.Trimesh, region_name: str, displacement: list) -> trimesh.Trimesh:
        """指定された部位を変形"""
        try:
            # 変形対象の頂点インデックスを取得
            region_indices = self.face_regions.get(region_name, [])
            
            if not region_indices:
                logger.warning(f"Region {region_name} not found")
                return mesh
            
            # メッシュをコピー
            deformed_mesh = mesh.copy()
            
            # 変形を適用
            displacement_vector = np.array(displacement)
            
            # インデックスがメッシュの頂点数を超えていないかチェック
            valid_indices = [idx for idx in region_indices if idx < len(deformed_mesh.vertices)]
            
            if valid_indices:
                # 頂点を変形（変形強度を調整）
                scaled_displacement = displacement_vector * 0.1  # 変形強度を1/10に調整
                deformed_mesh.vertices[valid_indices] += scaled_displacement
                logger.info(f"Deformed {len(valid_indices)} vertices in region {region_name} with displacement {scaled_displacement}")
            else:
                logger.warning(f"No valid vertices found for region {region_name}")
            
            return deformed_mesh
            
        except Exception as e:
            logger.error(f"Error deforming region {region_name}: {str(e)}")
            return mesh
    
    def _edit_nose_height(self, mesh: trimesh.Trimesh, intensity: float) -> trimesh.Trimesh:
        """鼻を高くする編集"""
        # 鼻の部位の頂点を取得
        nose_vertices = self._get_region_vertices(mesh, "nose_tip", "nose_bridge")
        
        # Z軸方向に移動（高くする）
        displacement = intensity * 0.1  # 強度に応じた移動量
        
        for vertex_idx in nose_vertices:
            mesh.vertices[vertex_idx, 2] += displacement  # Z軸方向
        
        return mesh
    
    def _edit_eye_size(self, mesh: trimesh.Trimesh, intensity: float) -> trimesh.Trimesh:
        """目を大きくする編集"""
        # 目の部位の頂点を取得
        left_eye = self._get_region_vertices(mesh, "left_eye")
        right_eye = self._get_region_vertices(mesh, "right_eye")
        
        # 目の中心を基準に拡大
        scale_factor = 1.0 + intensity * 0.2
        
        for eye_vertices in [left_eye, right_eye]:
            if eye_vertices:
                center = mesh.vertices[eye_vertices].mean(axis=0)
                for vertex_idx in eye_vertices:
                    # 中心からの相対位置を計算
                    relative_pos = mesh.vertices[vertex_idx] - center
                    # スケール適用
                    mesh.vertices[vertex_idx] = center + relative_pos * scale_factor
        
        return mesh
    
    def _edit_jaw_width(self, mesh: trimesh.Trimesh, intensity: float) -> trimesh.Trimesh:
        """顎を細くする編集"""
        # 顎のラインの頂点を取得
        jaw_vertices = self._get_region_vertices(mesh, "jaw_line")
        
        # 中心軸からの距離を縮小
        center_x = mesh.vertices[:, 0].mean()
        
        for vertex_idx in jaw_vertices:
            # X軸方向の距離を縮小
            relative_x = mesh.vertices[vertex_idx, 0] - center_x
            mesh.vertices[vertex_idx, 0] = center_x + relative_x * (1.0 - intensity * 0.3)
        
        return mesh
    
    def _edit_lip_thickness(self, mesh: trimesh.Trimesh, intensity: float) -> trimesh.Trimesh:
        """唇を厚くする編集"""
        # 口の部位の頂点を取得
        mouth_vertices = self._get_region_vertices(mesh, "mouth_outer")
        
        # 唇の厚みを増加（法線方向に移動）
        displacement = intensity * 0.05
        
        for vertex_idx in mouth_vertices:
            # 簡易的にY軸方向に移動（実際は法線計算が必要）
            mesh.vertices[vertex_idx, 1] += displacement
        
        return mesh
    
    def _edit_cheek_contour(self, mesh: trimesh.Trimesh, intensity: float) -> trimesh.Trimesh:
        """頬を引き締める編集"""
        # 頬の部位の頂点を取得
        left_cheek = self._get_region_vertices(mesh, "left_cheek")
        right_cheek = self._get_region_vertices(mesh, "right_cheek")
        
        # 頬を内側に移動
        displacement = intensity * 0.08
        
        for cheek_vertices in [left_cheek, right_cheek]:
            for vertex_idx in cheek_vertices:
                # 中心に向かって移動
                center = mesh.vertices[vertex_idx].copy()
                center[0] = 0  # X軸中心
                direction = center - mesh.vertices[vertex_idx]
                direction[0] = 0  # Y軸方向のみ
                if np.linalg.norm(direction) > 0:
                    direction = direction / np.linalg.norm(direction)
                    mesh.vertices[vertex_idx] += direction * displacement
        
        return mesh
    
    def _edit_forehead_width(self, mesh: trimesh.Trimesh, intensity: float) -> trimesh.Trimesh:
        """額を広くする編集"""
        # 額の部位の頂点を取得
        forehead_vertices = self._get_region_vertices(mesh, "forehead")
        
        # 額を左右に拡張
        scale_factor = 1.0 + intensity * 0.15
        center_x = mesh.vertices[forehead_vertices, 0].mean()
        
        for vertex_idx in forehead_vertices:
            relative_x = mesh.vertices[vertex_idx, 0] - center_x
            mesh.vertices[vertex_idx, 0] = center_x + relative_x * scale_factor
        
        return mesh
    
    def _get_region_vertices(self, mesh: trimesh.Trimesh, *region_names: str) -> list:
        """
        指定された部位の頂点インデックスを取得
        
        Args:
            mesh: 3Dメッシュ
            region_names: 部位名
            
        Returns:
            list: 頂点インデックスのリスト
        """
        vertices = []
        for region_name in region_names:
            if region_name in self.face_regions:
                # 実際の実装では、ランドマークインデックスと頂点インデックスの
                # マッピングが必要（ここでは簡易的に実装）
                region_indices = self.face_regions[region_name]
                
                # メッシュの頂点数を超えないように調整
                valid_indices = [idx for idx in region_indices if idx < len(mesh.vertices)]
                vertices.extend(valid_indices)
        
        return list(set(vertices))  # 重複を除去

