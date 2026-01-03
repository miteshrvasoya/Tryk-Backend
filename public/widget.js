(function() {
    console.log('Tryk Widget: Initializing...');
    // Configuration
    let API_BASE = 'http://localhost:3000/api'; 
    let WIDGET_KEY = null;

    // Check for global config (TrykConfig)
    if (window.TrykConfig) {
        if (window.TrykConfig.apiUrl) API_BASE = window.TrykConfig.apiUrl;
        if (window.TrykConfig.widgetKey) WIDGET_KEY = window.TrykConfig.widgetKey;
    }

    // Fallback to script attributes if not found in config
    if (!WIDGET_KEY) {
        const script = document.currentScript || document.querySelector(`script[src*="widget.js"]`);
        if (script) {
            WIDGET_KEY = script.getAttribute('data-widget-key');
        }
    }
    
    if (!WIDGET_KEY) {
        console.error('Tryk Widget: Missing widgetKey in TrykConfig or data-widget-key attribute.');
        return;
    }

    // State
    let isOpen = false;
    let config = {
        position: 'bottom-right',
        color: '#0D9488', // Default Teal
        title: 'Support',
        initialMessage: 'Hi there! How can I help you today?'
    };
    let messages = []; // Array of message objects { id, content, sender/role }
    let lastMessageId = null;

    // Create Widget Container (Shadow DOM Host)
    const container = document.createElement('div');
    container.id = 'tryk-widget-container';
    document.body.appendChild(container);
    
    const shadow = container.attachShadow({ mode: 'open' });

    // --- PREMIUM STYLES ---
    const styles = `
        :host {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            --primary-color: #0D9488; 
            --primary-gradient: linear-gradient(135deg, var(--primary-color) 0%, #0f766e 100%);
            --bg-glass: rgba(255, 255, 255, 0.90); /* Increased opacity for better contrast */
            --border-glass: rgba(255, 255, 255, 0.8);
            /* Stronger, multi-layer shadow for distinct pop */
            --shadow-lg: 
                0 0 0 1px rgba(0,0,0,0.05),
                0 20px 25px -5px rgba(0, 0, 0, 0.15), 
                0 8px 10px -6px rgba(0, 0, 0, 0.1);
            --shadow-sm: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            --text-main: #111827;
            --text-light: #6B7280;
            z-index: 2147483647;
            position: fixed;
            bottom: 24px;
            right: 24px;
            color: var(--text-main);
        }

        /* --- Launcher --- */
        .launcher {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: var(--primary-gradient);
            /* Add a white border ring for separation */
            border: 2px solid rgba(255,255,255,0.2); 
            box-shadow: 0 12px 24px rgba(0,0,0,0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
            position: relative;
        }

        .launcher:hover {
            transform: scale(1.1);
            box-shadow: 0 25px 30px -5px rgba(0, 0, 0, 0.25);
        }
        
        /* Pulse Animation for idle state */
        .launcher::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 2px solid var(--primary-color);
            opacity: 0;
            animation: pulse-ring 3s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
        
        @keyframes pulse-ring {
            0% { transform: scale(0.95); opacity: 0.5; }
            50%, 100% { transform: scale(1.5); opacity: 0; }
        }

        .launcher svg {
            width: 32px;
            height: 32px;
            color: white;
            transition: all 0.4s ease;
            position: absolute;
        }
        
        /* Icon Morphing */
        .launcher.open .chat-icon { transform: rotate(90deg) scale(0); opacity: 0; }
        .launcher.open .close-icon { transform: rotate(0) scale(1); opacity: 1; }
        .launcher:not(.open) .chat-icon { transform: rotate(0) scale(1); opacity: 1; }
        .launcher:not(.open) .close-icon { transform: rotate(-90deg) scale(0); opacity: 0; }

        /* --- Chat Window --- */
        .chat-window {
            position: absolute;
            bottom: 100px; /* Moved up slightly */
            right: 0;
            width: 380px;
            height: 650px;
            max-height: calc(100vh - 120px);
            background: var(--bg-glass);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            
            /* Enhanced Border Strategy: Inner Highlight + Outer Definition */
            border: 1px solid rgba(255, 255, 255, 0.6);
            box-shadow: 
                0 0 0 1px rgba(0,0,0,0.03), /* Subtle outline */
                0 30px 60px -12px rgba(50, 50, 93, 0.25), /* Deep shadow */
                0 18px 36px -18px rgba(0, 0, 0, 0.3), /* Ambient shadow */
                inset 0 1px 0 rgba(255,255,255,0.9); /* Top highlight (glass edge) */
            
            border-radius: 24px; /* Softer rounded corners */
            display: flex;
            flex-direction: column;
            overflow: hidden;
            
            /* Animation State: Hidden */
            opacity: 0;
            transform: translateY(20px) scale(0.95);
            pointer-events: none;
            transform-origin: bottom right;
            transition: all 0.4s cubic-bezier(0.19, 1, 0.22, 1);
        }

        .chat-window.visible {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
        }

        /* --- Header --- */
        .header {
            padding: 20px;
            background: rgba(255,255,255,0.4);
            border-bottom: 1px solid rgba(0,0,0,0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .header-info h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: -0.02em;
        }
        
        .status-dot {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-light);
            margin-top: 4px;
        }
        
        .dot {
            width: 8px;
            height: 8px;
            background: #10B981; /* Green-500 */
            border-radius: 50%;
            box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        }

        /* --- Messages Area --- */
        .messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
            scroll-behavior: smooth;
        }
        
        .message-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            animation: slideUp 0.3s ease-out forwards;
        }
        
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message {
            max-width: 85%;
            padding: 12px 16px;
            font-size: 14px;
            line-height: 1.5;
            position: relative;
        }

        .message.bot {
            align-self: flex-start;
            background: white;
            color: var(--text-main);
            border-radius: 16px 16px 16px 4px;
            box-shadow: var(--shadow-sm);
            border: 1px solid rgba(0,0,0,0.03);
        }

        .message.user {
            align-self: flex-end;
            background: var(--primary-gradient);
            color: white;
            border-radius: 16px 16px 4px 16px;
            box-shadow: 0 4px 12px rgba(13, 148, 136, 0.2);
        }

        .timestamp {
            font-size: 10px;
            margin-top: 4px;
            opacity: 0.7;
            align-self: flex-end; /* Default for bot */
        }
        
        .message-group.user .timestamp {
            align-self: flex-start; /* Correct for user if we used flex-direction column, but message-group is column.
            Wait, message-group is flex-col. 
            Bot message: self-start. Timestamp should be near it. 
            User message: self-end. Timestamp should be near it.
            */
             align-self: flex-end;
        }
        
        .message-group.bot .timestamp {
            align-self: flex-start;
        }
        
        /* --- Input Area --- */
        .input-area {
            padding: 16px;
            background: rgba(255,255,255,0.6);
            border-top: 1px solid rgba(0,0,0,0.05);
            display: flex;
            gap: 12px;
            align-items: flex-end;
        }

        textarea {
            flex: 1;
            background: white;
            border: 1px solid #E5E7EB;
            border-radius: 12px;
            padding: 12px;
            font-size: 14px;
            resize: none;
            height: 48px; /* Fixed height for MVP, can auto-expand later */
            font-family: inherit;
            outline: none;
            transition: all 0.2s;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
            color: var(--text-main);
        }

        textarea:focus {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1);
        }

        button.send-btn {
            background: var(--primary-gradient);
            color: white;
            border: none;
            border-radius: 12px;
            width: 48px;
            height: 48px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s;
            box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);
        }

        button.send-btn:hover {
            transform: scale(1.05);
        }

        button.send-btn:active {
            transform: scale(0.95);
        }
        
        button.send-btn svg {
            width: 20px; 
            height: 20px;
            margin-left: 2px; /* Visual balance */
        }
        
        /* --- Typing Indicator --- */
        .typing-container {
            align-self: flex-start;
            margin-bottom: 8px;
            display: none;
        }
        .typing-container.visible { display: block; animation: slideUp 0.3s ease-out; }
        
        .typing-bubble {
            background: white;
            padding: 12px 16px;
            border-radius: 16px 16px 16px 4px;
            box-shadow: var(--shadow-sm);
            width: fit-content;
            display: flex;
            gap: 4px;
        }

        .typing-dot {
            width: 6px;
            height: 6px;
            background: #9CA3AF;
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out both;
        }
        
        .typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .typing-dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }

        /* Mobile Responsive */
        @media (max-width: 480px) {
            .chat-window {
                width: calc(100vw - 40px);
                height: calc(100vh - 100px);
                bottom: 90px;
                right: 0;
            }
        }
    `;

    // DOM Elements
    let launcher, chatWindow, messagesContainer, textArea, sendBtn, typingIndicator;
    let autoScraperTriggered = false;

    async function init() {
        console.log('Tryk Widget: init() called, Key:', WIDGET_KEY, 'API:', API_BASE);
        try {
            // Fetch Config
            const response = await fetch(`${API_BASE}/widget/config/${WIDGET_KEY}`);
            if (response.ok) {
                const fetchedConfig = await response.json();
                config = { ...config, ...fetchedConfig };
            }
        } catch (e) {
            console.error('Tryk Widget: Failed to load config', e);
        }

        render();
        await fetchHistory(); // Initial fetch

        // Polling Strategy (every 5 seconds)
        setInterval(fetchHistory, 5000);
    }

    async function fetchHistory() {
        try {
            const customerId = getCustomerId();
            const res = await fetch(`${API_BASE}/chat/history?widgetKey=${WIDGET_KEY}&customerId=${customerId}`);
            if (!res.ok) return;

            const fetchedMessages = await res.json();
            console.log(`[Tryk Widget] Polled. Set: ${messages.length}, Fetched: ${fetchedMessages.length}`);
            
            // Should filter for new messages only
            // Simple approach: if more messages than local, perform update
            // Local state `messages` should track full history
            
            if (fetchedMessages.length > messages.length) {
                // Determine new messages
                const newMessages = fetchedMessages.slice(messages.length);
                console.log(`[Tryk Widget] New messages found:`, newMessages);
                
                // Update local state
                messages = fetchedMessages;
                
                // Render only new messages
                newMessages.forEach(msg => {
                    const isUser = msg.role === 'user';
                    renderMessage(msg.content, isUser, false, msg.created_at); // false = not optimistic
                });
            }
        } catch (e) {
            console.error('[Tryk Widget] Polling Error', e);
        }
    }

    function render() {
        // Inject Styles
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles.replace(/--primary-color: #0D9488/g, `--primary-color: ${config.color}`);
        
        // Dynamically update gradient if color changes (simple approximation)
        if (config.color !== '#0D9488') {
             styleSheet.textContent = styleSheet.textContent.replace(
                 /--primary-gradient: .*/, 
                 `--primary-gradient: linear-gradient(135deg, ${config.color} 0%, ${config.color} 100%);`
             );
        }
        
        shadow.appendChild(styleSheet);
        
        // Position Adjustment
        if (config.position === 'bottom-left') {
             styleSheet.textContent += `
                :host { right: auto; left: 24px; }
                .chat-window { right: auto; left: 0; transform-origin: bottom left; }
             `;
        }

        // HTML Structure
        shadow.innerHTML += `
            <div class="chat-window">
                <div class="header">
                    <div class="header-info">
                        <h3>${config.title}</h3>
                        <div class="status-dot">
                            <div class="dot"></div>
                            <span>Online</span>
                        </div>
                    </div>
                </div>
                
                <div class="messages">
                    <div class="message-group">
                        <div class="message bot">${config.initialMessage}</div>
                    </div>
                    
                    <div class="typing-container">
                        <div class="typing-bubble">
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                        </div>
                    </div>
                </div>
                
                <div class="input-area">
                    <textarea placeholder="Ask a question..."></textarea>
                    <button class="send-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </div>
            
            <div class="launcher">
                <svg class="chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                <svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </div>
        `;

        // Bind Elements
        launcher = shadow.querySelector('.launcher');
        chatWindow = shadow.querySelector('.chat-window');
        messagesContainer = shadow.querySelector('.messages');
        textArea = shadow.querySelector('textarea');
        sendBtn = shadow.querySelector('.send-btn');
        typingIndicator = shadow.querySelector('.typing-container');

        // Events
        launcher.addEventListener('click', toggleChat);
        textArea.addEventListener('keypress', handleKeyPress);
        sendBtn.addEventListener('click', sendMessage);
    }

    function toggleChat() {
        isOpen = !isOpen;
        if (isOpen) {
            chatWindow.classList.add('visible');
            launcher.classList.add('open');
            setTimeout(() => textArea.focus(), 100);
        } else {
            chatWindow.classList.remove('visible');
            launcher.classList.remove('open');
        }
    }

    function handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function renderMessage(text, isUser, optimistic = true, /* optional */ timestamp = null) {
        // De-duplication check: if this exact text is already the LAST message
        const lastMsgGroup = messagesContainer.lastElementChild?.previousElementSibling; // skip typing indicator
        if (lastMsgGroup && lastMsgGroup.classList.contains('message-group')) {
             const lastText = lastMsgGroup.querySelector('.message').textContent;
             const lastIsUser = lastMsgGroup.querySelector('.message').classList.contains('user');
             
             if (lastText === text && lastIsUser === isUser) {
                 return; // Duplicate
             }
        }
    
        // Create container for animation
        const group = document.createElement('div');
        group.className = `message-group ${isUser ? 'user' : 'bot'}`; // Added class for easier styling
        
        const div = document.createElement('div');
        div.className = `message ${isUser ? 'user' : 'bot'}`;
        div.textContent = text;
        
        group.appendChild(div);

        // Timestamp
        const ts = document.createElement('div');
        ts.className = 'timestamp';
        const dateObj = timestamp ? new Date(timestamp) : new Date();
        ts.textContent = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        group.appendChild(ts);
        
        // Insert before typing indicator
        messagesContainer.insertBefore(group, typingIndicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function sendMessage() {
        const text = textArea.value.trim();
        if (!text) return;

        textArea.value = '';
        textArea.value = '';
        renderMessage(text, true, true, new Date().toISOString()); // Optimistic render with NOW
        messages.push({ role: 'user', content: text }); // optimistic state update
        
        // Disable input
        textArea.disabled = true;
        sendBtn.disabled = true;
        typingIndicator.classList.add('visible');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const response = await fetch(`${API_BASE}/chat/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    widgetKey: WIDGET_KEY,
                    message: text,
                    customerId: getCustomerId()
                })
            });

            if (!response.ok) throw new Error('Failed to send');
            
            const data = await response.json();
            const botText = data.response || data.message || "I'm not sure how to answer that.";
            
            renderMessage(botText, false, true, new Date().toISOString());
            messages.push({ role: 'assistant', content: botText }); // optimistic state update

        } catch (e) {
            console.error('Chat Error', e);
            renderMessage("Sorry, something went wrong. Please try again.", false);
        } finally {
            typingIndicator.classList.remove('visible');
            textArea.disabled = false;
            sendBtn.disabled = false;
            textArea.focus();
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
    
    function getCustomerId() {
        let id = localStorage.getItem('tryk_customer_id');
        if (!id) {
            id = 'cust_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('tryk_customer_id', id);
        }
        return id;
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
