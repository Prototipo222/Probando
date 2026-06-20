from pathlib import Path
path = Path('index.html')
text = path.read_text(encoding='utf-8')
replacements = {
    'Â·': '·',
    'Ã¡': 'á',
    'Ã©': 'é',
    'Ã­': 'í',
    'Ã³': 'ó',
    'Ãº': 'ú',
    'Ã±': 'ñ',
    'Ã‘': 'Ñ',
    'Ã‰': 'É',
    'Ã“': 'Ó',
    'Ãš': 'Ú',
    'Â¿': '¿',
    'Â¡': '¡',
    'Ã¼': 'ü',
    'Ãœ': 'Ü',
    'PequeÃ±o': 'Pequeño',
}
for old, new in replacements.items():
    text = text.replace(old, new)
path.write_text(text, encoding='utf-8')
print('Index encoding fixed')
