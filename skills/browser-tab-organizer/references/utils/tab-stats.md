# Utility: Tab Domain Statistics
Use this when you need an overview of how many tabs are open per domain, sorted by frequency.

## Script Location
- `skills/browser-tab-organizer/scripts/tab_stats.py`

## Workflow
1. **Export Tab Data**:
   Use `get-list-of-open-tabs` with:
   - `dump`: A path in the temporary directory (e.g., `<temp_dir>/tabs_dump.json`).
   - `fields`: `["url"]`.

2. **Run Analysis**:
   Execute the Python script via `run_shell_command`:
   `python3 skills/browser-tab-organizer/scripts/tab_stats.py <temp_dir>/tabs_dump.json`

3. **Cleanup**:
   **MANDATORY**: After the user has seen the results and confirmed no further testing is needed, delete the temporary JSON file using `rm`.

## Output Example
```text
Domain                                   | Count     
-----------------------------------------------------
github.com                               | 456       
www.biorxiv.org                          | 83        
mp.weixin.qq.com                         | 54        
```
