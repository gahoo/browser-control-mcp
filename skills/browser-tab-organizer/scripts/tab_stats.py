import json
import sys
import os
from urllib.parse import urlparse
from collections import Counter

def main(json_path):
    if not os.path.exists(json_path):
        print(f"Error: File {json_path} not found.")
        return

    try:
        with open(json_path, 'r') as f:
            tabs = json.load(f)
    except Exception as e:
        print(f"Error reading JSON: {e}")
        return

    domains = [urlparse(t['url']).netloc for t in tabs if 'url' in t]
    stats = Counter(domains).most_common()

    print(f"{'Domain':<40} | {'Count':<10}")
    print("-" * 53)
    for domain, count in stats[:30]:
        print(f"{domain:<40} | {count:<10}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 tab_stats.py <path_to_json>")
    else:
        main(sys.argv[1])
