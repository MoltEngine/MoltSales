import json
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import os

def analyze_variables(json_path):
    print(f"Loading data from {json_path}...")
    with open(json_path, 'r') as f:
        data = json.load(f)

    # Flatten the data for analysis
    rows = []
    for item in data:
        prompt_id = item.get('id', 'N/A')
        category = item.get('category', 'Unknown')
        use_case = item.get('use_case', 'Unknown')
        variables = item.get('variables', [])
        
        if not variables:
            rows.append({
                'id': prompt_id,
                'category': category,
                'use_case': use_case,
                'variable': 'NONE',
                'has_variables': False
            })
        else:
            for var in variables:
                # Normalize common variations
                norm_var = var.strip()
                rows.append({
                    'id': prompt_id,
                    'category': category,
                    'use_case': use_case,
                    'variable': norm_var,
                    'has_variables': True
                })

    df = pd.DataFrame(rows)
    
    # Filter out 'NONE' for variable-specific analysis
    df_vars = df[df['has_variables'] == True]

    # 1. Variable Frequency
    var_counts = df_vars['variable'].value_counts().reset_index()
    var_counts.columns = ['variable', 'count']

    # 2. Category vs Variable Distribution
    # We'll look at the top 15 variables
    top_15_vars = var_counts.head(15)['variable'].tolist()
    df_top = df_vars[df_vars['variable'].isin(top_15_vars)]
    cat_var_matrix = df_top.groupby(['category', 'variable']).size().unstack(fill_value=0)

    # Create the Visualizations
    
    # Chart 1: Top Variables (Horizontal Bar)
    fig1 = px.bar(
        var_counts.head(20), 
        x='count', 
        y='variable', 
        orientation='h',
        title='Top 20 Most Frequent Variables',
        labels={'count': 'Appearance Count', 'variable': 'Variable Name'},
        color='count',
        color_continuous_scale='Magma'
    )
    fig1.update_layout(yaxis={'categoryorder':'total ascending'}, template='plotly_dark')

    # Chart 2: Category x Variable Heatmap
    fig2 = px.imshow(
        cat_var_matrix,
        labels=dict(x="Variable", y="Category", color="Count"),
        x=cat_var_matrix.columns,
        y=cat_var_matrix.index,
        title='Heatmap: Variable Usage Across Categories (Top 15 Vars)',
        color_continuous_scale='Viridis'
    )
    fig2.update_layout(template='plotly_dark')

    # Chart 3: Variables per Category (Box Plot)
    prompt_var_counts = df_vars.groupby(['id', 'category']).size().reset_index(name='var_count')
    fig3 = px.box(
        prompt_var_counts, 
        x='category', 
        y='var_count',
        title='Variables per Prompt by Category',
        labels={'var_count': 'Number of Variables', 'category': 'Category'},
        color='category'
    )
    fig3.update_layout(template='plotly_dark', showlegend=False)

    # Save to a single responsive HTML file
    output_html = 'docs/variable_analysis_report.html'
    
    # Create a combined dashboard using subplots or just multiple HTML divs
    with open(output_html, 'w') as f:
        f.write('<html><head><title>Variable Analysis Report</title>')
        f.write('<style>body { background-color: #111; color: white; font-family: sans-serif; margin: 0; padding: 20px; }')
        f.write('.container { max-width: 1200px; margin: auto; } h1 { text-align: center; color: #00d2ff; }')
        f.write('.chart { margin-bottom: 50px; border: 1px solid #333; border-radius: 8px; overflow: hidden; }</style>')
        f.write('</head><body><div class="container">')
        f.write('<h1>Prompt Variable Intelligence Report</h1>')
        f.write('<div class="chart">' + fig1.to_html(full_html=False, include_plotlyjs='cdn') + '</div>')
        f.write('<div class="chart">' + fig2.to_html(full_html=False, include_plotlyjs=False) + '</div>')
        f.write('<div class="chart">' + fig3.to_html(full_html=False, include_plotlyjs=False) + '</div>')
        f.write('</div></body></html>')

    print(f"Analysis complete! Open '{output_html}' in your browser to view the interactive dashboard.")

if __name__ == "__main__":
    json_path = os.path.join(os.getcwd(), 'data', 'mvp_prompts.json')
    if os.path.exists(json_path):
        analyze_variables(json_path)
    else:
        print(f"Error: Could not find {json_path}")
