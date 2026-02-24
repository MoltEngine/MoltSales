import json
import os
from collections import defaultdict

def generate_category_summary(json_path, output_path):
    print(f"Reading prompts from {json_path}...")
    with open(json_path, 'r') as f:
        data = json.load(f)

    # Dictionary to hold category information
    # Structure: level -> category -> list of use cases and a representative summary
    levels_map = defaultdict(lambda: defaultdict(list))
    
    # We will map "tree_level" to the specific categories inside it
    for item in data:
        level = map_level(item.get('tree_level', 1))
        category = item.get('category', 'Uncategorized')
        use_case = item.get('use_case', '')
        
        levels_map[level][category].append(use_case)

    # Now construct the final summary JSON
    summary_index = {}
    
    # Define hand-crafted summaries for the LLM based on the levels to make it highly effective
    level_summaries = {
        "Level 1: Prospecting & Initial Outreach": "Use these when initiating first contact, researching targets, mapping pain points, or designing initial outbound sequences.",
        "Level 2: Sales Prep & Qualification": "Use these when preparing for an upcoming call, building battlecards, structuring discovery questions, or predicting objections.",
        "Level 3: Advanced Deal Strategy": "Use these for active, complex deals: ROI justification, mutual action plans, competitor autopsies, and temporal leverage.",
        "Level 4: Operations & Management": "Use these for internal rep management, analyzing pipeline velocity, summarizing activities, or generating collateral and charts."
    }

    for level, categories in sorted(levels_map.items()):
        summary_index[level] = {
            "categories": list(categories.keys()),
            "summary": level_summaries.get(level, "General sales tasks and workflows."),
            "example_use_cases": [] # We will pull 2-3 examples per category to give the LLM "flavor"
        }
        
        # Give the LLM a tiny sample of what lives in these categories so it can accurately route
        examples = []
        for cat, use_cases in categories.items():
            # Get up to 3 unique use cases per category as examples
            sample = list(set(use_cases))[:3]
            examples.extend(sample)
            
        summary_index[level]["example_use_cases"] = examples[:10] # cap examples

    print(f"Generated summary for {len(summary_index)} levels.")
    
    with open(output_path, 'w') as f:
        json.dump(summary_index, f, indent=4)
        
    print(f"Category summary saved to {output_path}")

def map_level(tree_level):
    if tree_level == 1:
        return "Level 1: Prospecting & Initial Outreach"
    elif tree_level == 2:
        return "Level 2: Sales Prep & Qualification"
    elif tree_level == 3:
        return "Level 3: Advanced Deal Strategy"
    else:
        return "Level 4: Operations & Management"

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, 'data', 'mvp_prompts.json')
    output_path = os.path.join(base_dir, 'data', 'category_summary.json')
    
    if os.path.exists(json_path):
        generate_category_summary(json_path, output_path)
    else:
        print(f"Error: Could not find {json_path}")
