
import os

base_dir = '/Users/nhelvengonzales/.gemini/antigravity/scratch/monday_integration'
index_path = os.path.join(base_dir, 'Index.html')
style_path = os.path.join(base_dir, 'Stylesheet.html')
js_path = os.path.join(base_dir, 'JavaScript.html')
preview_path = os.path.join(base_dir, 'PreviewIndex.html')

with open(index_path, 'r') as f:
    index_content = f.read()

with open(style_path, 'r') as f:
    style_content = f.read()

with open(js_path, 'r') as f:
    js_content = f.read()

# Replace includes
# Note: The exact string in Index.html is <?!= include('Stylesheet'); ?> and <?!= include('JavaScript'); ?>
# We should be careful with whitespace.

preview_content = index_content.replace("<?!= include('Stylesheet'); ?>", style_content)
preview_content = preview_content.replace("<?!= include('JavaScript'); ?>", js_content)

with open(preview_path, 'w') as f:
    f.write(preview_content)

print(f"Created {preview_path}")
