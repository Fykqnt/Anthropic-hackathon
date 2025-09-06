import yaml
import os
from typing import Dict, Any, List, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class Config:
    """設定管理クラス"""
    
    def __init__(self, config_path: Optional[str] = None):
        """
        設定を初期化
        
        Args:
            config_path: 設定ファイルのパス（省略時はデフォルト）
        """
        if config_path is None:
            config_path = Path(__file__).parent / "mvp_config.yaml"
        
        self.config_path = Path(config_path)
        self._config = self._load_config()
        
        logger.info(f"Config loaded from: {self.config_path}")
    
    def _load_config(self) -> Dict[str, Any]:
        """設定ファイルを読み込み"""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
            
            # 環境変数でオーバーライド
            config = self._apply_env_overrides(config)
            
            return config
            
        except FileNotFoundError:
            logger.error(f"Config file not found: {self.config_path}")
            return self._get_default_config()
        except yaml.YAMLError as e:
            logger.error(f"Error parsing config file: {e}")
            return self._get_default_config()
    
    def _apply_env_overrides(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """環境変数で設定をオーバーライド"""
        # API設定の環境変数オーバーライド
        if "PYTHON_API_PORT" in os.environ:
            config.setdefault("api", {})["port"] = int(os.environ["PYTHON_API_PORT"])
        
        if "PYTHON_API_HOST" in os.environ:
            config.setdefault("api", {})["host"] = os.environ["PYTHON_API_HOST"]
        
        # Nano Banana APIキー
        if "NANO_BANANA_API_KEY" in os.environ:
            config.setdefault("nano_banana", {})["api_key"] = os.environ["NANO_BANANA_API_KEY"]
        
        # 開発設定
        if "DEBUG" in os.environ:
            config.setdefault("development", {})["debug"] = os.environ["DEBUG"].lower() == "true"
        
        return config
    
    def _get_default_config(self) -> Dict[str, Any]:
        """デフォルト設定を返す"""
        return {
            "app_name": "CosmeticSim-MVP",
            "version": "0.1.0",
            "targets": [
                "nasal_tip_mm",
                "nasal_bridge_mm", 
                "eye_size_ratio",
                "jaw_width_mm",
                "lip_thickness_mm",
                "cheek_contour_mm",
                "forehead_width_mm",
                "submental_fat_mm"
            ],
            "assumptions": {
                "ipd_mm_default": 63.0,
                "px_per_mm_fallback": "auto"
            },
            "limits": {
                "max_delta_mm": 4.0,
                "min_delta_mm": -4.0,
                "max_image_mb": 10,
                "min_image_px": 1024,
                "max_processing_time_sec": 120
            },
            "api": {
                "host": "0.0.0.0",
                "port": 8000,
                "workers": 1,
                "timeout": 120
            }
        }
    
    def get(self, key: str, default: Any = None) -> Any:
        """設定値を取得（ドット記法対応）"""
        keys = key.split('.')
        value = self._config
        
        try:
            for k in keys:
                value = value[k]
            return value
        except (KeyError, TypeError):
            return default
    
    def get_targets(self) -> List[str]:
        """対象施術部位を取得"""
        return self.get("targets", [])
    
    def get_assumptions(self) -> Dict[str, Any]:
        """顔計測の仮定値を取得"""
        return self.get("assumptions", {})
    
    def get_limits(self) -> Dict[str, Any]:
        """制限値を取得"""
        return self.get("limits", {})
    
    def get_render_config(self) -> Dict[str, Any]:
        """レンダリング設定を取得"""
        return self.get("render", {})
    
    def get_nano_banana_config(self) -> Dict[str, Any]:
        """Nano Banana設定を取得"""
        return self.get("nano_banana", {})
    
    def get_safety_config(self) -> Dict[str, Any]:
        """安全設定を取得"""
        return self.get("safety", {})
    
    def get_api_config(self) -> Dict[str, Any]:
        """API設定を取得"""
        return self.get("api", {})
    
    def get_development_config(self) -> Dict[str, Any]:
        """開発設定を取得"""
        return self.get("development", {})
    
    def get_target_params(self, target: str) -> Dict[str, float]:
        """特定部位の変形パラメータを取得"""
        assumptions = self.get_assumptions()
        
        # 部位名からパラメータを構築
        radius_key = f"{target}_radius_mm"
        sigma_key = f"{target}_sigma_mm"
        
        return {
            "radius_mm": assumptions.get(radius_key, 12.0),
            "sigma_mm": assumptions.get(sigma_key, 8.0)
        }
    
    def is_target_supported(self, target: str) -> bool:
        """指定された部位がサポートされているかチェック"""
        return target in self.get_targets()
    
    def get_max_delta(self, target: str) -> float:
        """指定部位の最大変形量を取得"""
        limits = self.get_limits()
        
        # 部位によって最大変形量を調整
        target_max_deltas = {
            "nasal_tip_mm": 3.0,
            "nasal_bridge_mm": 2.5,
            "eye_size_ratio": 0.3,
            "jaw_width_mm": 4.0,
            "lip_thickness_mm": 2.0,
            "cheek_contour_mm": 3.5,
            "forehead_width_mm": 5.0,
            "submental_fat_mm": 3.0
        }
        
        return target_max_deltas.get(target, limits.get("max_delta_mm", 4.0))
    
    def get_min_delta(self, target: str) -> float:
        """指定部位の最小変形量を取得"""
        limits = self.get_limits()
        
        # 部位によって最小変形量を調整
        target_min_deltas = {
            "nasal_tip_mm": -3.0,
            "nasal_bridge_mm": -2.5,
            "eye_size_ratio": -0.3,
            "jaw_width_mm": -4.0,
            "lip_thickness_mm": -2.0,
            "cheek_contour_mm": -3.5,
            "forehead_width_mm": -5.0,
            "submental_fat_mm": -3.0
        }
        
        return target_min_deltas.get(target, limits.get("min_delta_mm", -4.0))
    
    def validate_delta(self, target: str, delta: float) -> bool:
        """変形量が有効範囲内かチェック"""
        min_delta = self.get_min_delta(target)
        max_delta = self.get_max_delta(target)
        
        return min_delta <= delta <= max_delta
    
    def reload(self):
        """設定を再読み込み"""
        self._config = self._load_config()
        logger.info("Config reloaded")
    
    def to_dict(self) -> Dict[str, Any]:
        """設定を辞書として返す"""
        return self._config.copy()

# グローバル設定インスタンス
config = Config()

