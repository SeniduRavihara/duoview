"""Build a load-unpacked ZIP using Python's standard library."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
output = root / 'dist' / 'duoview-1.0.0.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for file in sorted((root / 'extension').rglob('*')):
        if file.is_file():
            archive.write(file, Path('duoview') / file.relative_to(root))
    archive.write(root / 'README.md', 'duoview/README.md')
print(output)
