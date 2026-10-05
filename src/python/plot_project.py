"""Display the exact figure saved from Spectraliser at export time."""
import json
from pathlib import Path

import plotly.graph_objects as go


def show_project_plot():
    project_dir = Path(__file__).resolve().parent
    with open(project_dir / 'plot.json', encoding='utf-8') as handle:
        saved = json.load(handle)
    for notice in saved['notices']:
        print(f'Plot notice: {notice}')
    figure = go.Figure(data=saved['data'], layout=saved['layout'])
    output = project_dir / 'plot.html'
    figure.write_html(
        output,
        include_plotlyjs=True,
        include_mathjax='cdn' if saved['usesMath'] else False,
        auto_open=True,
        config={'responsive': True, 'displaylogo': False},
    )
    print(f'Export-time figure saved to {output}; open it manually if no browser appeared.')
    return figure
