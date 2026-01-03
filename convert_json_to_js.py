import json

def convert():
    try:
        with open('unicode_data.json', 'r') as f:
            data = json.load(f)
        
        js_content = "window.UNICODE_DATA = " + json.dumps(data, indent=1) + ";"
        
        with open('unicode_data.js', 'w') as f:
            f.write(js_content)
            
        print("Successfully converted unicode_data.json to unicode_data.js")
    except FileNotFoundError:
        print("Error: unicode_data.json not found.")

if __name__ == "__main__":
    convert()
