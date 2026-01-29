
// popup.ts


interface QuickAction {
    name: string;
    template: string;
}

// Default actions
const DEFAULT_ACTIONS: QuickAction[] = [
    { name: "Summarize Page", template: "Please summarize the content of this page:\n\n{{content}}" },
    { name: "Explain Selection", template: "Explain this text:\n\n{{selection}}" },
];

let quickActions: QuickAction[] = [...DEFAULT_ACTIONS];

interface HistoryItem {
    timestamp: number;
    prompt: string;
    result: string;
    model: string;
}

const MAX_HISTORY_ITEMS = 20;
let promptHistory: HistoryItem[] = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Render Quick Actions
    renderQuickActions();

    // Check Server Status
    checkServerStatus();

    // Initialize Model Selector
    initModelSelector();

    // Initialize History
    initHistory();

    // Settings Button
    document.getElementById('settings-btn')?.addEventListener('click', () => {
        browser.runtime.openOptionsPage();
    });

    // Run Custom Prompt Button
    document.getElementById('run-prompt-btn')?.addEventListener('click', async () => {
        const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
        const prompt = promptInput.value;
        if (prompt) {
            await runPrompt(prompt);
        }
    });

    // Close Result
    document.getElementById('close-result-btn')?.addEventListener('click', () => {
        document.getElementById('result-area')?.classList.add('hidden');
    });

    // Clear History Button
    document.getElementById('clear-history-btn')?.addEventListener('click', async () => {
        if (confirm("Are you sure you want to clear browsing history?")) {
            await clearHistory();
        }
    });
});

function renderQuickActions() {
    const list = document.getElementById('quick-actions-list');
    if (!list) return;

    list.innerHTML = '';
    quickActions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.textContent = action.name;
        btn.onclick = () => runPrompt(action.template);
        list.appendChild(btn);
    });
}

async function runPrompt(template: string) {
    showLoading();

    try {
        // 1. Get Context (Active Tab)
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];

        if (!activeTab || !activeTab.id) {
            throw new Error("No active tab found");
        }

        // 2. Hydrate Template handles {{selection}} and {{content}}
        // We need to execute script to get selection/content
        const context = await getTabContext(activeTab.id);
        const hydratedPrompt = hydrateTemplate(template, context);

        // 3. Get Selected Model
        const model = getSelectedModel();

        // 4. Send to Background
        const response = await browser.runtime.sendMessage({
            type: "run-prompt", // Internal message type for background script
            prompt: hydratedPrompt,
            tabId: activeTab.id,
            model: model
        });

        // 5. Handle Response
        if (response && response.error) {
            showResult(`Error: ${response.error}`);
        } else if (response && response.content) {
            showResult(response.content);
            // Save to history
            await addToHistory(hydratedPrompt, response.content, model);
        } else {
            showResult("No response received.");
        }

    } catch (error) {
        showResult(`Error: ${String(error)}`);
    }
}

async function getTabContext(tabId: number): Promise<{ selection: string, content: string, url: string, title: string }> {
    try {
        // Inject a content script or use executeScript to get selection/content
        // Simple extraction script
        const results = await browser.tabs.executeScript(tabId, {
            code: `({
                selection: window.getSelection()?.toString() || "",
                content: document.body.innerText,
                url: window.location.href,
                title: document.title
            })`
        });

        if (results && results[0]) {
            return results[0] as any;
        }
    } catch (e) {
        console.error("Failed to get tab context", e);
    }
    return { selection: "", content: "", url: "", title: "" };
}

function hydrateTemplate(template: string, context: { selection: string, content: string, url: string, title: string }): string {
    return template
        .replace(/{{selection}}/g, context.selection)
        .replace(/{{content}}/g, context.content)
        .replace(/{{url}}/g, context.url)
        .replace(/{{title}}/g, context.title);
}

function showLoading() {
    const resultArea = document.getElementById('result-area');
    const resultContent = document.getElementById('result-content');
    if (resultArea && resultContent) {
        resultArea.classList.remove('hidden');
        resultContent.textContent = "Processing...";
    }
}

function showResult(text: string) {
    const resultContent = document.getElementById('result-content');
    if (resultContent) {
        resultContent.textContent = text;
    }
}

async function checkServerStatus() {
    // const indicator = document.getElementById('status-indicator'); // Old indicator
    const resultArea = document.getElementById('result-area'); // Reuse result area for status messages if needed? No, just use dot.
    const statusDot = document.getElementById('status-dot');
    const promptBtn = document.getElementById('run-prompt-btn') as HTMLButtonElement;
    const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;

    if (!statusDot) return;

    try {
        statusDot.className = "status-dot warning"; // Set to Yellow (Warning) while checking connection
        statusDot.title = "Checking connection...";
        statusDot.style.backgroundColor = ""; // Clear any inline styles

        // Default to disabled state while checking
        if (promptBtn) promptBtn.disabled = true;
        if (promptInput) promptInput.disabled = true;

        const response = await browser.runtime.sendMessage({
            type: "get-server-status"
        });

        if (response && response.capabilities && response.capabilities.sampling) {
            statusDot.className = "status-dot ready"; // Set to Green (Ready)
            statusDot.title = "Server Ready (Sampling Supported)";

            if (promptBtn) promptBtn.disabled = false;
            if (promptInput) promptInput.disabled = false;
        } else {
            // Connected but no sampling
            statusDot.className = "status-dot warning"; // Set to Yellow (Warning)
            statusDot.title = "Server Connected (No Sampling)";

            if (promptBtn) promptBtn.disabled = true;
            if (promptInput) promptInput.disabled = true;

            // Also disable quick action buttons
            const actionBtns = document.querySelectorAll('.action-btn');
            actionBtns.forEach((btn: any) => btn.disabled = true);
        }
    } catch (error) {
        console.error("Status check failed", error);
        statusDot.className = "status-dot error"; // Force error state
        statusDot.title = "Connection Failed";

        if (promptBtn) promptBtn.disabled = true;
        if (promptInput) promptInput.disabled = true;
    }
}

// --- Model Selection Logic ---

function initModelSelector() {
    const select = document.getElementById('model-select') as HTMLSelectElement;
    const customInput = document.getElementById('custom-model-input') as HTMLInputElement;

    if (!select || !customInput) return;

    // Load saved selection
    browser.storage.local.get(['selectedModel', 'customModel']).then((res) => {
        if (res.selectedModel) {
            select.value = res.selectedModel;
            if (res.selectedModel === 'custom') {
                customInput.style.display = 'block';
                if (res.customModel) customInput.value = res.customModel;
            }
        }
    });

    select.addEventListener('change', () => {
        const val = select.value;
        if (val === 'custom') {
            customInput.style.display = 'block';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
        }

        // Save selection
        browser.storage.local.set({ selectedModel: val });
    });

    customInput.addEventListener('change', () => {
        browser.storage.local.set({ customModel: customInput.value });
    });
}

function getSelectedModel(): string {
    const select = document.getElementById('model-select') as HTMLSelectElement;
    const customInput = document.getElementById('custom-model-input') as HTMLInputElement;

    if (select && select.value === 'custom' && customInput) {
        return customInput.value || "auto";
    }
    return select ? select.value : "auto";
}


// --- History Logic ---

async function initHistory() {
    const res = await browser.storage.local.get('promptHistory');
    promptHistory = res.promptHistory || [];
    renderHistory();
}

async function addToHistory(prompt: string, result: string, model: string) {
    const item: HistoryItem = {
        timestamp: Date.now(),
        prompt,
        result,
        model
    };

    promptHistory.unshift(item);
    if (promptHistory.length > MAX_HISTORY_ITEMS) {
        promptHistory = promptHistory.slice(0, MAX_HISTORY_ITEMS);
    }

    await browser.storage.local.set({ promptHistory });
    renderHistory();
}

async function clearHistory() {
    promptHistory = [];
    await browser.storage.local.set({ promptHistory });
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;

    list.innerHTML = '';

    if (promptHistory.length === 0) {
        list.innerHTML = '<div style="color: #888; text-align: center; font-size: 12px; padding: 10px;">No history yet.</div>';
        return;
    }

    promptHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';

        const date = new Date(item.timestamp).toLocaleString();

        div.innerHTML = `
            <div class="history-timestamp">${date} (${item.model})</div>
            <div class="history-prompt" title="${item.prompt.replace(/"/g, '&quot;')}">${item.prompt}</div>
            <div class="history-result" title="${item.result.replace(/"/g, '&quot;')}">${item.result}</div>
        `;

        div.onclick = () => {
            // Re-populate prompt
            // Maybe just show result? For now, let's just populate the result area
            showResult(item.result);
            const resultArea = document.getElementById('result-area');
            if (resultArea) resultArea.classList.remove('hidden');
        };

        list.appendChild(div);
    });
}

