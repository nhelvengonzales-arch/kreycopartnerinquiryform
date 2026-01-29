
import os

base_dir = '/Users/nhelvengonzales/.gemini/antigravity/scratch/monday_integration'
index_path = os.path.join(base_dir, 'Index.html')
style_path = os.path.join(base_dir, 'Stylesheet.html')
js_path = os.path.join(base_dir, 'JavaScript.html')
preview_path = os.path.join(base_dir, 'Preview Folder', 'preview_v6.html')

with open(index_path, 'r') as f:
    index_content = f.read()

with open(style_path, 'r') as f:
    style_content = f.read()

with open(js_path, 'r') as f:
    js_content = f.read()

# Replace Stylesheet include
# The line is usually:   <?!= include('Stylesheet'); ?>
# We'll replace the exact string or look for it.
if "<?!= include('Stylesheet'); ?>" in index_content:
    print("Found Stylesheet include")
    index_content = index_content.replace("<?!= include('Stylesheet'); ?>", style_content)
else:
    print("WARNING: Stylesheet include not found exactly")

# Replace JavaScript include
if "<?!= include('JavaScript'); ?>" in index_content:
    print("Found JavaScript include")
    index_content = index_content.replace("<?!= include('JavaScript'); ?>", js_content)
else:
    print("WARNING: JavaScript include not found exactly")

with open(preview_path, 'w') as f:
    f.write(index_content)

print(f"Created {preview_path} with length {len(index_content)}")
