import re
from typing import Dict, List, Any, Optional, Tuple
import logging
from config import config

logger = logging.getLogger(__name__)

class InstructionParser:
    """編集指示解析クラス"""
    
    def __init__(self):
        """初期化"""
        self.targets = config.get_targets()
        self.limits = config.get_limits()
        
        # 日本語キーワードマッピング
        self.keyword_mapping = {
            # 鼻関連
            "鼻尖": "nasal_tip_mm",
            "鼻先": "nasal_tip_mm", 
            "鼻の先": "nasal_tip_mm",
            "鼻筋": "nasal_bridge_mm",
            "鼻の高さ": "nasal_bridge_mm",
            
            # 目関連
            "目": "eye_size_ratio",
            "目のサイズ": "eye_size_ratio",
            "目の大きさ": "eye_size_ratio",
            
            # 顎関連
            "顎": "jaw_width_mm",
            "顎幅": "jaw_width_mm",
            "あご": "jaw_width_mm",
            
            # 唇関連
            "唇": "lip_thickness_mm",
            "くちびる": "lip_thickness_mm",
            "唇の厚さ": "lip_thickness_mm",
            
            # 頬関連
            "頬": "cheek_contour_mm",
            "ほほ": "cheek_contour_mm",
            "ほお": "cheek_contour_mm",
            
            # 額関連
            "額": "forehead_width_mm",
            "ひたい": "forehead_width_mm",

            # 顎下脂肪（サブメンタル）関連
            "顎下": "submental_fat_mm",
            "顎下脂肪": "submental_fat_mm",
            "顎下脂肪吸引": "submental_fat_mm",
            "二重顎": "submental_fat_mm",
            "サブメンタル": "submental_fat_mm",
            "submental": "submental_fat_mm"
        }
        
        # 動作キーワード
        self.action_keywords = {
            "高く": ("increase", 1.0),
            "高": ("increase", 1.0),
            "大きく": ("increase", 1.0),
            "大": ("increase", 1.0),
            "厚く": ("increase", 1.0),
            "厚": ("increase", 1.0),
            "広く": ("increase", 1.0),
            "広": ("increase", 1.0),
            "引き締め": ("decrease", 1.0),
            "細く": ("decrease", 1.0),
            "細": ("decrease", 1.0),
            "小さく": ("decrease", 1.0),
            "小": ("decrease", 1.0),
            "薄く": ("decrease", 1.0),
            "薄": ("decrease", 1.0),
            "狭く": ("decrease", 1.0),
            "狭": ("decrease", 1.0),
            # 脂肪吸引系
            "吸引": ("decrease", 1.0)
        }
        
        # 強度キーワード
        self.intensity_keywords = {
            "少し": 0.3,
            "軽く": 0.3,
            "ちょっと": 0.4,
            "適度に": 0.5,
            "普通に": 0.5,
            "かなり": 0.7,
            "強く": 0.8,
            "とても": 0.8,
            "非常に": 0.9,
            "極めて": 1.0
        }
        
        logger.info("InstructionParser initialized")
    
    def parse_instruction(self, instruction: str) -> List[Dict[str, Any]]:
        """
        編集指示を解析して構造化された操作リストに変換
        
        Args:
            instruction: 自然言語の編集指示
            
        Returns:
            List[Dict]: 編集操作のリスト
        """
        try:
            logger.info(f"Parsing instruction: {instruction}")
            
            # 前処理
            normalized_instruction = self._normalize_instruction(instruction)
            
            # 部位と動作を抽出
            operations = self._extract_operations(normalized_instruction)
            
            # 数値による変形量を抽出
            operations = self._extract_numerical_values(instruction, operations)
            
            # 検証と正規化
            operations = self._validate_and_normalize_operations(operations)
            
            logger.info(f"Parsed operations: {operations}")
            return operations
            
        except Exception as e:
            logger.error(f"Error parsing instruction: {str(e)}")
            return []
    
    def _normalize_instruction(self, instruction: str) -> str:
        """指示文を正規化"""
        # 全角数字を半角に変換
        instruction = instruction.translate(str.maketrans('０１２３４５６７８９', '0123456789'))
        
        # 余分な空白を削除
        instruction = re.sub(r'\s+', ' ', instruction.strip())
        
        return instruction
    
    def _extract_operations(self, instruction: str) -> List[Dict[str, Any]]:
        """指示から編集操作を抽出"""
        operations = []
        
        # 各部位キーワードをチェック
        for keyword, target in self.keyword_mapping.items():
            if keyword in instruction:
                # 対応する動作キーワードを探す
                action_found = None
                for action_keyword, (action_type, base_intensity) in self.action_keywords.items():
                    if action_keyword in instruction:
                        action_found = (action_type, base_intensity)
                        break
                
                # 動作キーワードが見つからない場合は、数値の符号から推測
                if not action_found:
                    # 数値の符号をチェック
                    if '+' in instruction or 'プラス' in instruction:
                        action_found = ("increase", 1.0)
                    elif '-' in instruction or 'マイナス' in instruction:
                        action_found = ("decrease", 1.0)
                    else:
                        # デフォルトは増加
                        action_found = ("increase", 1.0)
                
                if action_found:
                    action_type, base_intensity = action_found
                    
                    # 強度キーワードをチェック
                    intensity_multiplier = 1.0
                    for intensity_keyword, multiplier in self.intensity_keywords.items():
                        if intensity_keyword in instruction:
                            intensity_multiplier = multiplier
                            break
                    
                    # デフォルト変形量を計算
                    default_delta = self._get_default_delta(target, action_type)
                    delta = default_delta * intensity_multiplier
                    
                    operation = {
                        "target": target,
                        "delta_mm": delta,
                        "action_type": action_type,
                        "intensity_multiplier": intensity_multiplier,
                        "keyword_found": keyword,
                        "action_found": action_found[0]
                    }
                    
                    operations.append(operation)
        
        return operations
    
    def _extract_numerical_values(self, instruction: str, operations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """数値による変形量を抽出"""
        # mm単位の数値を抽出
        mm_pattern = r'([+-]?\d+(?:\.\d+)?)\s*mm'
        mm_matches = re.findall(mm_pattern, instruction, re.IGNORECASE)
        
        # 比率の数値を抽出
        ratio_pattern = r'([+-]?\d+(?:\.\d+)?)\s*%'
        ratio_matches = re.findall(ratio_pattern, instruction, re.IGNORECASE)
        
        # 強度数値（0-10）を抽出
        intensity_pattern = r'強度\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*強度'
        intensity_matches = re.findall(intensity_pattern, instruction, re.IGNORECASE)
        
        # 数値マッチを統合
        all_numerical_values = []
        for match in mm_matches:
            all_numerical_values.append(("mm", float(match)))
        for match in ratio_matches:
            all_numerical_values.append(("ratio", float(match) / 100.0))
        for match in intensity_matches:
            intensity_val = float(match[0] or match[1])
            all_numerical_values.append(("intensity", intensity_val / 10.0))
        
        # 操作に数値を適用
        if all_numerical_values and operations:
            # 最初の数値を最初の操作に適用
            value_type, value = all_numerical_values[0]
            operations[0]["delta_mm"] = self._convert_value_to_delta(
                operations[0]["target"], value, value_type
            )
            operations[0]["numerical_value"] = value
            operations[0]["value_type"] = value_type
        
        return operations
    
    def _convert_value_to_delta(self, target: str, value: float, value_type: str) -> float:
        """数値を変形量に変換"""
        if value_type == "mm":
            # ミリメートル値はそのまま使用
            return value
        elif value_type == "ratio":
            # 比率値は最大変形量に適用
            max_delta = config.get_max_delta(target)
            return value * max_delta
        elif value_type == "intensity":
            # 強度値（0-1）は最大変形量に適用
            max_delta = config.get_max_delta(target)
            return value * max_delta
        else:
            return value
    
    def _get_default_delta(self, target: str, action_type: str) -> float:
        """デフォルト変形量を取得"""
        max_delta = config.get_max_delta(target)
        
        # 部位別のデフォルト変形量
        default_ratios = {
            "nasal_tip_mm": 0.6,      # 鼻尖: 最大の60%
            "nasal_bridge_mm": 0.5,    # 鼻筋: 最大の50%
            "eye_size_ratio": 0.3,     # 目: 最大の30%
            "jaw_width_mm": 0.7,       # 顎: 最大の70%
            "lip_thickness_mm": 0.5,   # 唇: 最大の50%
            "cheek_contour_mm": 0.6,   # 頬: 最大の60%
            "forehead_width_mm": 0.8,  # 額: 最大の80%
            "submental_fat_mm": 0.6    # 顎下脂肪: 最大の60%
        }
        
        default_ratio = default_ratios.get(target, 0.5)
        delta = max_delta * default_ratio
        
        # decreaseアクションの場合は負の値
        if action_type == "decrease":
            delta = -delta
        
        return delta
    
    def _validate_and_normalize_operations(self, operations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """操作を検証して正規化"""
        validated_operations = []
        
        for operation in operations:
            target = operation["target"]
            delta = operation["delta_mm"]
            
            # 変形量の範囲チェック
            if config.validate_delta(target, delta):
                # パラメータを追加
                params = config.get_target_params(target)
                operation.update(params)
                
                validated_operations.append(operation)
            else:
                logger.warning(f"Invalid delta {delta} for target {target}")
        
        return validated_operations
    
    def get_supported_targets(self) -> List[str]:
        """サポートされている対象部位を取得"""
        return self.targets
    
    def get_target_keywords(self) -> Dict[str, List[str]]:
        """対象部位のキーワードを取得"""
        reverse_mapping = {}
        for keyword, target in self.keyword_mapping.items():
            if target not in reverse_mapping:
                reverse_mapping[target] = []
            reverse_mapping[target].append(keyword)
        
        return reverse_mapping
    
    def parse_examples(self) -> List[Dict[str, str]]:
        """解析例を取得"""
        examples = [
            {
                "instruction": "鼻尖 +1.8mm",
                "description": "鼻尖を1.8mm前方に移動"
            },
            {
                "instruction": "目を大きくする",
                "description": "目のサイズをデフォルト強度で拡大"
            },
            {
                "instruction": "顎を細くする 強度3",
                "description": "顎幅を強度3で縮小"
            },
            {
                "instruction": "唇を厚くする 少し",
                "description": "唇を少し厚くする（低強度）"
            },
            {
                "instruction": "頬を引き締める かなり",
                "description": "頬をかなり引き締める（高強度）"
            }
        ]
        
        return examples
