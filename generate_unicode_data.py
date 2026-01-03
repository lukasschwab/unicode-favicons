import unicodedata
import json
import sys

def generate_data():
    data = []
    # Ranges: BMP + SMP + SIP + TIP + ... (Full Unicode)
    ranges = [
        (0x0020, 0x10FFFF)
    ]

    for start, end in ranges:
        for code in range(start, end + 1):
            # Skip Surrogates
            if 0xD800 <= code <= 0xDFFF:
                continue

            char = chr(code)
            category = unicodedata.category(char)
            
            # Skip Control, Surrogate, Private Use
            if category.startswith('C'):
                continue
            
            try:
                name = unicodedata.name(char)
                # Optimization: Convert name to lowercase for easier client-side search?
                # Keep it original for display, client can lowercase.
                data.append([code, name])
            except ValueError:
                continue
    
    with open('unicode_data.json', 'w') as f:
        json.dump(data, f, indent=1)
    
    print(f"Generated {len(data)} characters.")

if __name__ == "__main__":
    generate_data()
