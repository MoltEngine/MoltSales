import json
import os

def generate_distilled_index(json_path, output_path):
    print(f"Reading prompts from {json_path}...")
    with open(json_path, 'r') as f:
        data = json.load(f)

    # Organize by category
    index = {}
    
    for item in data:
        category = item.get('category', 'Uncategorized')
        use_case = item.get('use_case', 'Unknown Use Case')
        prompt_id = item.get('id', 'N/A')
        
        source = item.get('source', 'Unknown')
        
        if category not in index:
            index[category] = []
            
        index[category].append({
            "id": prompt_id,
            "use_case": use_case,
            "source": source
        })

    # Sort categories and use_cases for consistent output
    sorted_index = {cat: sorted(index[cat], key=lambda x: x['id']) for cat in sorted(index.keys())}

    print(f"Generated index with {len(data)} prompts across {len(sorted_index)} categories.")
    
    with open(output_path, 'w') as f:
        json.dump(sorted_index, f, indent=4)
        
    print(f"Distilled index saved to {output_path}")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, 'data', 'mvp_prompts.json')
    output_path = os.path.join(base_dir, 'data', 'prompt_index.json')
    
    if os.path.exists(json_path):
        generate_distilled_index(json_path, output_path)
    else:
        print(f"Error: Could not find {json_path}")
