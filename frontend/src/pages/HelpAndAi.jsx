import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import { MicIcon, SparkleIcon } from "../components/Icons";

function renderFormattedAnswer(text = "") {
    return String(text)
        .split("\n")
        .map((line, lineIdx) => {
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
                <span key={lineIdx} style={{ display: "block", marginBottom: line.trim() ? 4 : 8 }}>
                    {parts.map((part, i) =>
                        part.startsWith("**") && part.endsWith("**") ? (
                            <strong key={i}>{part.slice(2, -2)}</strong>
                        ) : (
                            part
                        )
                    )}
                </span>
            );
        });
}

export default function HelpAndAi() {
    const { user, isAuthenticated, language } = useAuth();

    const [aiQuery, setAiQuery] = useState("");
    const [aiResult, setAiResult] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [knowledgeDocs, setKnowledgeDocs] = useState([]);

    const [ticketType, setTicketType] = useState("support");
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [ticketFeedback, setTicketFeedback] = useState({ type: "", message: "" });
    const [myTickets, setMyTickets] = useState([]);

    useEffect(() => {
        apiRequest("/ai/knowledge", { cacheKey: "knowledge_docs" })
            .then((res) => setKnowledgeDocs(res.data || []))
            .catch(() => {});

        if (isAuthenticated) {
            apiRequest("/support/my")
                .then((res) => setMyTickets(res.data || []))
                .catch(() => {});
        }
    }, [isAuthenticated]);

    const askAssistant = async (e, overrideQuery = null) => {
        if (e) e.preventDefault();
        const q = (overrideQuery ?? aiQuery).trim();
        if (!q) return;
        if (overrideQuery) setAiQuery(overrideQuery);
        setAiLoading(true);
        try {
            const res = await apiRequest("/ai/ask", {
                method: "POST",
                body: { query: q, language }
            });
            setAiResult(res);
        } catch (err) {
            setAiResult({
                abstained: true,
                answer: err.message || "AI assistant could not be reached.",
                citations: [],
                safetyNotice: "Fallback error state."
            });
        } finally {
            setAiLoading(false);
        }
    };

    const startVoice = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const rec = new SpeechRecognition();
        rec.lang = language === "hi" ? "hi-IN" : language === "pa" ? "pa-IN" : "en-IN";
        rec.onresult = (evt) => {
            const txt = evt.results?.[0]?.[0]?.transcript || "";
            if (txt) askAssistant(null, txt);
        };
        rec.start();
    };

    const submitTicket = async (e) => {
        e.preventDefault();
        setTicketFeedback({ type: "", message: "" });
        try {
            const res = await apiRequest("/support", {
                method: "POST",
                body: {
                    type: ticketType,
                    subject,
                    description,
                    contactEmail: user?.email || contactEmail
                }
            });
            setTicketFeedback({ type: "success", message: res.message });
            setSubject("");
            setDescription("");
            if (res.data) setMyTickets((prev) => [res.data, ...prev]);
        } catch (err) {
            setTicketFeedback({ type: "error", message: err.message || "Failed to submit ticket." });
        }
    };

    return (
        <div style={{ display: "grid", gap: 24 }}>
            <div>
                <h1 style={{ fontSize: 28 }}>Accessible Help, Policies &amp; Educational AI</h1>
                <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                    Available without signing in. Our AI retrieves answers strictly from reviewed catalog records and policy documents with citations, and abstains from clinical or dosing questions.
                </p>
            </div>

            <div className="grid-2" style={{ alignItems: "start" }}>
                {/* Educational AI RAG Assistant */}
                <section className="card">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ color: "var(--mw-teal)" }}><SparkleIcon size={22} /></span>
                        <h2 style={{ fontSize: 20 }}>MedWatch Educational AI (RAG)</h2>
                    </div>

                    <div className="alert-box info" style={{ fontSize: 13 }}>
                        Abstains on diagnosis, dosing, or substitutions. PII is redacted before retrieval.
                    </div>

                    <form onSubmit={askAssistant} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                        <input
                            type="text"
                            aria-label="Ask MedWatch educational AI"
                            placeholder="Ask about Vitamin C, cancellation policy, DPDP privacy..."
                            value={aiQuery}
                            onChange={(e) => setAiQuery(e.target.value)}
                            style={{ flex: "1 1 200px", minWidth: 0, padding: "10px 12px", border: "1px solid #C6D8DA", borderRadius: 8 }}
                        />
                        <button type="button" className="btn btn-outline btn-sm" onClick={startVoice} title="Voice query" aria-label="Voice query">
                            <MicIcon size={16} />
                        </button>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={aiLoading}>
                            {aiLoading ? "Checking..." : "Ask"}
                        </button>
                    </form>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => askAssistant(null, "Tell me about Vitamin C")}>
                            "Vitamin C info"
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => askAssistant(null, "What is the demo order cancellation policy?")}>
                            "Cancellation policy"
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => askAssistant(null, "What dosage of Paracetamol should I take for my fever?")}>
                            Test Clinical Abstention
                        </button>
                    </div>

                    {aiResult && (
                        <div className="card-compact" style={{ background: aiResult.abstained ? "var(--mw-amber-bg)" : "#F4FAFA", borderColor: aiResult.abstained ? "var(--mw-amber-border)" : "var(--mw-border)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <strong style={{ fontSize: 14 }}>
                                    {aiResult.abstained ? "Safety Guardrail / Abstention" : "Grounded Response"}
                                </strong>
                                <StatusBadge status={aiResult.abstained ? "pending" : "verified"} label={aiResult.abstained ? "Abstained" : "Cited"} />
                            </div>
                            <div style={{ fontSize: 14, marginBottom: 10 }}>
                                {renderFormattedAnswer(aiResult.answer)}
                            </div>

                            {(aiResult.citations || []).length > 0 && (
                                <div style={{ borderTop: "1px solid var(--mw-border)", paddingTop: 8, marginTop: 8 }}>
                                    <strong style={{ fontSize: 12 }}>Sources &amp; Review Timestamps:</strong>
                                    <ul style={{ paddingLeft: 18, fontSize: 12, color: "var(--mw-muted)", marginTop: 4 }}>
                                        {aiResult.citations.map((c, idx) => (
                                            <li key={idx}>
                                                {c.title} — <em>{c.source}</em> ({new Date(c.reviewedAt).toLocaleDateString()})
                                                {c.isDemo ? " [DEMO]" : ""}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <p style={{ fontSize: 11, color: "var(--mw-muted)", marginTop: 8 }}>{aiResult.safetyNotice}</p>
                        </div>
                    )}
                </section>

                {/* Support, Corrections & Feedback Form */}
                <section className="card">
                    <h2 style={{ fontSize: 20, marginBottom: 10 }}>Human Support, Corrections &amp; Feedback</h2>
                    <p style={{ fontSize: 13, color: "var(--mw-muted)", marginBottom: 14 }}>
                        Need human assistance, want to report an inaccurate catalog record, or share accessibility feedback?
                    </p>

                    {ticketFeedback.message && (
                        <div className={`alert-box ${ticketFeedback.type}`}>{ticketFeedback.message}</div>
                    )}

                    <form onSubmit={submitTicket} className="form-grid">
                        <div className="field">
                            <label htmlFor="ticketType">Request Type</label>
                            <select id="ticketType" value={ticketType} onChange={(e) => setTicketType(e.target.value)}>
                                <option value="support">General Support</option>
                                <option value="correction">Catalog / Directory Correction</option>
                                <option value="feedback">Accessibility / UX Feedback</option>
                            </select>
                        </div>

                        {!isAuthenticated && (
                            <div className="field">
                                <label htmlFor="contactEmail">Your Email (Optional for follow-up)</label>
                                <input
                                    id="contactEmail"
                                    type="email"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    placeholder="name@example.com"
                                />
                            </div>
                        )}

                        <div className="field">
                            <label htmlFor="ticketSubject">Subject</label>
                            <input
                                id="ticketSubject"
                                type="text"
                                required
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Short summary of your request..."
                            />
                        </div>

                        <div className="field">
                            <label htmlFor="ticketDesc">Details</label>
                            <textarea
                                id="ticketDesc"
                                rows={3}
                                required
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe what happened or what needs verification..."
                            />
                        </div>

                        <button type="submit" className="btn btn-primary">Submit Request</button>
                    </form>
                </section>
            </div>

            {/* Reviewed Policy & Help Documents */}
            <section className="card">
                <h2 style={{ fontSize: 20, marginBottom: 14 }}>Reviewed Platform Policies &amp; Multilingual Help</h2>
                <div className="grid-2">
                    {knowledgeDocs.map((doc) => (
                        <article key={doc._id} className="card-compact" style={{ background: "var(--mw-bg)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                                <strong style={{ fontSize: 15 }}>{doc.title}</strong>
                                <span className="status-badge neutral">{doc.language?.toUpperCase()} · {doc.category}</span>
                            </div>
                            <p style={{ fontSize: 13, color: "var(--mw-text)", marginBottom: 8 }}>{doc.content}</p>
                            <small style={{ color: "var(--mw-muted)" }}>
                                Source: {doc.sourceCitation} · Reviewed {new Date(doc.reviewedAt || doc.updatedAt).toLocaleDateString()}
                            </small>
                        </article>
                    ))}
                </div>
            </section>

            {isAuthenticated && myTickets.length > 0 && (
                <section className="card">
                    <h2 style={{ fontSize: 20, marginBottom: 12 }}>Your Submitted Tickets ({myTickets.length})</h2>
                    <div style={{ display: "grid", gap: 10 }}>
                        {myTickets.map((tk) => (
                            <div key={tk._id} className="card-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                <div>
                                    <strong>{tk.ticketNumber}</strong> · {tk.subject}
                                    <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>{tk.resolutionNote || tk.description}</p>
                                </div>
                                <StatusBadge status={tk.status} />
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
