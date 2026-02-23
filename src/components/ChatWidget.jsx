import { useCallback, useEffect, useMemo, useState } from 'react'

const AI_API_URL = 'https://gc4a7icjti.execute-api.ap-south-1.amazonaws.com/dev/meetlite-ai-api'

const quickQuestions = [
  'How do I create and share a meeting?',
  'How do I join using meeting ID?',
  'Why does it show waiting for video?',
  'How do Camera and Mute buttons work?',
  'How do I use notes in a meeting?',
]

const initialMessages = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Hi, I am MeetLite AI. Ask me how to use any feature.',
  },
]

function fallbackReply(input, isAuthenticated) {
  const text = (input || '').toLowerCase()

  if (!isAuthenticated) return 'Please sign in first. Then open Dashboard to create or join a meeting.'
  if (text.includes('create')) return 'Dashboard -> Create Meeting. Copy generated meeting ID and share with others.'
  if (text.includes('join')) return 'Dashboard -> Enter meeting ID -> Join Meeting. Allow camera/microphone permissions.'
  if (text.includes('waiting') || text.includes('video')) return 'Check network stability and ensure all users joined same meeting ID. Rejoin once if needed.'
  if (text.includes('mute') || text.includes('camera')) return 'Mute toggles microphone. Camera toggles video stream visibility.'
  if (text.includes('note')) return 'Use Notes button in meeting room to open notes panel and save notes.'
  if (text.includes('record')) return 'Record is currently UI state; backend recording storage API will be integrated later.'

  return 'I can help with login, create/join meeting, controls, and common troubleshooting.'
}

function ChatWidget({ isAuthenticated = false, onNavigate, isMeetingPage = false }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [messages, setMessages] = useState(initialMessages)

  const containerClass = useMemo(
    () => `chat-widget ${isMeetingPage ? 'meeting-offset' : ''}`,
    [isMeetingPage],
  )

  const clearConversation = useCallback(() => {
    setMessages(initialMessages)
    setInput('')
    setSessionId('')
    setShowQuickActions(true)
    setIsLoading(false)
  }, [])

  const handleClose = useCallback(() => {
    clearConversation()
    setOpen(false)
  }, [clearConversation])

  const handleToggle = useCallback(() => {
    if (open) {
      handleClose()
      return
    }
    setOpen(true)
  }, [open, handleClose])

  const askApi = useCallback(
    async (text) => {
      try {
        const response = await fetch(AI_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: {
              message: text,
              sessionId: sessionId || 'optional-session-id',
            },
          }),
        })

        const outer = await response.json().catch(() => ({}))
        const parsedBody = typeof outer?.body === 'string' ? JSON.parse(outer.body) : outer?.body || outer
        const reply = parsedBody?.reply || outer?.reply
        const nextSession = parsedBody?.sessionId || outer?.sessionId

        if (nextSession) setSessionId(nextSession)
        return reply || fallbackReply(text, isAuthenticated)
      } catch {
        return fallbackReply(text, isAuthenticated)
      }
    },
    [isAuthenticated, sessionId],
  )

  const sendMessage = useCallback(
    async (text, options = { includeUser: true, hideQuickActions: false }) => {
      const clean = text.trim()
      if (!clean || isLoading) return

      if (options.hideQuickActions) {
        setShowQuickActions(false)
      }

      if (options.includeUser) {
        const userMessage = { id: `u-${Date.now()}`, role: 'user', text: clean }
        setMessages((prev) => [...prev, userMessage])
      }

      setIsLoading(true)
      const reply = await askApi(clean)

      const assistantMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: reply,
      }
      setMessages((prev) => [...prev, assistantMessage])
      setInput('')
      setIsLoading(false)
    },
    [askApi, isLoading],
  )

  const onQuickAsk = (question) => {
    sendMessage(question, { includeUser: false, hideQuickActions: true })
  }

  useEffect(() => {
    const onAsk = (event) => {
      const question = (event?.detail?.question || '').trim()
      if (!question) return
      setOpen(true)
      sendMessage(question, { includeUser: false, hideQuickActions: true })
    }

    window.addEventListener('meetlite-ai-ask', onAsk)
    return () => window.removeEventListener('meetlite-ai-ask', onAsk)
  }, [sendMessage])

  useEffect(() => {
    if (open) {
      document.body.classList.add('chat-open')
    } else {
      document.body.classList.remove('chat-open')
    }
    return () => document.body.classList.remove('chat-open')
  }, [open])

  return (
    <div className={containerClass}>
      {open ? (
        <section className="chat-panel" aria-label="MeetLite AI chat">
          <header className="chat-panel-header">
            <strong>MeetLite AI</strong>
            <div className="chat-panel-header-actions">
              <button type="button" onClick={clearConversation}>
                Clear
              </button>
              <button type="button" onClick={handleClose}>
                Close
              </button>
            </div>
          </header>

          <div className="chat-messages">
            {messages.map((message) => (
              <div key={message.id} className={`chat-msg ${message.role}`}>
                {message.text}
              </div>
            ))}
            {isLoading ? <div className="chat-msg assistant">Thinking...</div> : null}
          </div>

          {showQuickActions ? (
            <div className="chat-quick-actions">
              {quickQuestions.map((question) => (
                <button key={question} type="button" onClick={() => onQuickAsk(question)}>
                  {question}
                </button>
              ))}
            </div>
          ) : null}

          <div className="chat-input-row">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about MeetLite features"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  sendMessage(input, { includeUser: true, hideQuickActions: false })
                }
              }}
            />
            <button
              type="button"
              onClick={() => sendMessage(input, { includeUser: true, hideQuickActions: false })}
              disabled={isLoading}
            >
              Send
            </button>
          </div>

          {!isAuthenticated ? (
            <button type="button" className="chat-login-hint" onClick={() => onNavigate?.('/')}>
              Login to start meetings
            </button>
          ) : null}
        </section>
      ) : null}

      <button type="button" className="chat-fab" onClick={handleToggle}>
        MeetLite AI
      </button>
    </div>
  )
}

export default ChatWidget
