import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
/**
 * Claude Code batch script for automatic prompt optimization
 * 
 * This script:
 * 1. Analyzes recent feedback patterns
 * 2. Generates diff suggestions using Claude
 * 3. Validates and gates the suggestions
 * 4. Registers new arms for A/B testing
 */

import { sbAdmin } from "../src/lib/supabaseAdmin";
import { DiffSchema, type Diff } from "../src/lib/prompt";
import Anthropic from "@anthropic-ai/sdk";

interface FailurePattern {
  procedure: string;
  intensityRange: string;
  failureRate: number;
  commonReasons: string[];
  sampleSize: number;
}

// Analyze recent feedback to identify failure patterns
async function analyzeFailurePatterns(days: number = 7): Promise<FailurePattern[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const { data: recentFeedback, error } = await sbAdmin
    .from('feedback')
    .select(`
      rating,
      reason,
      generations!inner(
        procedure,
        intensities,
        created_at
      )
    `)
    .gte('generations.created_at', cutoffDate.toISOString())
    .order('generations.created_at', { ascending: false });

  if (error || !recentFeedback) {
    console.error('Failed to fetch feedback:', error);
    return [];
  }

  // Group by procedure and intensity ranges
  const patterns: { [key: string]: { total: number; failures: number; reasons: string[] } } = {};

  recentFeedback.forEach(item => {
    if (!item.generations) return;
    
    const gen = item.generations as any;
    const intensitySum = Object.values(gen.intensities || {}).reduce((sum: number, val: any) => sum + (val || 0), 0);
    const intensityRange = intensitySum <= 5 ? 'low' : intensitySum <= 15 ? 'medium' : 'high';
    
    const key = `${gen.procedure}-${intensityRange}`;
    
    if (!patterns[key]) {
      patterns[key] = { total: 0, failures: 0, reasons: [] };
    }
    
    patterns[key].total++;
    if (item.rating === 0) {
      patterns[key].failures++;
      if (item.reason) patterns[key].reasons.push(item.reason);
    }
  });

  // Convert to failure patterns with significant failure rates
  return Object.entries(patterns)
    .filter(([_, stats]) => stats.total >= 10 && stats.failures / stats.total > 0.3) // >30% failure rate
    .map(([key, stats]) => {
      const [procedure, intensityRange] = key.split('-');
      return {
        procedure,
        intensityRange,
        failureRate: stats.failures / stats.total,
        commonReasons: [...new Set(stats.reasons)].slice(0, 5), // Top 5 unique reasons
        sampleSize: stats.total
      };
    })
    .sort((a, b) => b.failureRate - a.failureRate);
}

// Generate diff suggestions using Claude
async function generateDiffSuggestions(patterns: FailurePattern[]): Promise<Diff[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY missing; skipping Claude suggestions");
    return [];
  }

  const anthropic = new Anthropic({ apiKey });

  const prompt = `あなたは美容AIのプロンプト改善エンジニアです。次の失敗傾向を踏まえ、最小編集の差分(JSON)と sampling 推奨(temperature/top_p) を最大3案、出力ONLY JSONで返して下さい。禁止語は厳守してください。

失敗傾向(JSON): ${JSON.stringify(patterns).slice(0, 6000)}

JSON出力フォーマット例:
{
  "changes": [
    { "selector": "guidance.nose.bridge", "op": "replace", "before": "…", "after": "…", "rationale": "…" }
  ],
  "sampling": { "temperature": 0.6, "top_p": 0.9 },
  "version_bump": "patch"
}

注意:
- 変更は最大5点まで。過度な改変は禁止。
- 医療広告法に反する誇大表現は使用しない（例: 完璧, 絶対, 100%, 奇跡, 魔法）。
- 必ず純粋なJSON配列([Diff])のみを返す。`;

  const resp = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1200,
    messages: [
      { role: "user", content: prompt }
    ]
  });

  const text = resp.content?.[0]?.type === "text" ? resp.content[0].text : String(resp.content);
  try {
    const parsed = JSON.parse(text as string);
    const arr: Diff[] = Array.isArray(parsed) ? parsed : [parsed];
    return arr.slice(0, 3);
  } catch (e) {
    console.warn("Claude returned non-JSON or invalid JSON; skipping.", e);
    return [];
  }
}

// Validate diff suggestions
function validateDiff(diff: Diff): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Schema validation
  const schemaResult = DiffSchema.safeParse(diff);
  if (!schemaResult.success) {
    errors.push(...schemaResult.error.issues.map(issue => issue.message));
  }
  
  // Business rules validation
  if (diff.changes && diff.changes.length > 5) {
    errors.push("Too many changes in single diff (max 5)");
  }
  
  // Check for prohibited terms (medical advertising compliance)
  const prohibitedTerms = ['完璧', '絶対', '100%', '奇跡', '魔法'];
  for (const change of diff.changes || []) {
    if (prohibitedTerms.some(term => change.after.includes(term))) {
      errors.push(`Prohibited term found in change: ${change.selector}`);
    }
  }
  
  // Sampling parameter validation
  if (diff.sampling) {
    if (diff.sampling.temperature && (diff.sampling.temperature < 0.1 || diff.sampling.temperature > 1.0)) {
      errors.push("Temperature must be between 0.1 and 1.0");
    }
    if (diff.sampling.top_p && (diff.sampling.top_p < 0.1 || diff.sampling.top_p > 1.0)) {
      errors.push("top_p must be between 0.1 and 1.0");
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// Register new arms in database
async function registerArms(diffs: Diff[]): Promise<string[]> {
  const armIds: string[] = [];
  
  for (const diff of diffs) {
    try {
      const { data, error } = await sbAdmin
        .from('arms')
        .insert({
          base_prompt_version: 'v1',
          diff_json: diff,
          sampling_json: diff.sampling || { temperature: 0.7, top_p: 0.9 },
          active: false, // Start inactive for safety
          notes: `Auto-generated by Claude Code batch at ${new Date().toISOString()}`
        })
        .select('arm_id')
        .single();
      
      if (error) {
        console.error('Failed to register arm:', error);
        continue;
      }
      
      // Initialize arm stats
      await sbAdmin
        .from('arm_stats')
        .insert({
          arm_id: data.arm_id,
          shows: 0,
          thumbs_up: 0,
          thumbs_down: 0
        });
      
      armIds.push(data.arm_id);
      console.log(`Registered new arm: ${data.arm_id}`);
      
    } catch (error) {
      console.error('Error registering arm:', error);
    }
  }
  
  return armIds;
}

// Main batch process
export async function runBatchOptimization(): Promise<void> {
  console.log('Starting Claude Code batch optimization...');
  
  try {
    // Step 1: Analyze failure patterns
    console.log('Analyzing failure patterns...');
    const patterns = await analyzeFailurePatterns(7);
    console.log(`Found ${patterns.length} failure patterns`);
    
    if (patterns.length === 0) {
      console.log('No significant failure patterns found. Exiting.');
      return;
    }
    
    // Step 2: Generate suggestions
    console.log('Generating diff suggestions...');
    const suggestions = await generateDiffSuggestions(patterns);
    console.log(`Generated ${suggestions.length} diff suggestions`);
    
    // Step 3: Validate suggestions
    console.log('Validating suggestions...');
    const validSuggestions = suggestions.filter(diff => {
      const validation = validateDiff(diff);
      if (!validation.valid) {
        console.warn('Invalid diff rejected:', validation.errors);
        return false;
      }
      return true;
    });
    
    console.log(`${validSuggestions.length} valid suggestions passed validation`);
    
    // Step 4: Register new arms
    if (validSuggestions.length > 0) {
      console.log('Registering new arms...');
      const armIds = await registerArms(validSuggestions);
      console.log(`Successfully registered ${armIds.length} new arms`);
      
      // TODO: Implement gradual rollout (activate arms with min exposure rate)
      console.log('New arms registered but inactive. Manual activation required.');
    }
    
    console.log('Batch optimization completed successfully');
    
  } catch (error) {
    console.error('Batch optimization failed:', error);
    throw error;
  }
}

// CLI entry point
if (require.main === module) {
  runBatchOptimization()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
