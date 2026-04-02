import { useEffect, useState } from "react";
import { getDashboardAnalytics } from "../../services/insightsApi.js";

const defaultData = {
  kpis: [
    { label: "Total Budget Queries", value: "0", trend: "0%" },
    { label: "Resolved by AI", value: "0", trend: "0%" },
    { label: "Avg Confidence", value: "0%", trend: "0%" },
    { label: "Pending Human Review", value: "0", trend: "0%" }
  ],
  stackedTrend: {
    months: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
    chat: [0, 0, 0, 0, 0, 0],
    email: [0, 0, 0, 0, 0, 0],
    voice: [0, 0, 0, 0, 0, 0]
  },
  confidenceDistribution: { high: 0, medium: 0, low: 0, average: 0 },
  heatmapCells: Array(42).fill(0),
  topTopics: [],
  alerts: []
};

export default function DashboardPanel({ authToken }) {
  const [data, setData] = useState(defaultData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const response = await getDashboardAnalytics(authToken);
        setData(response.dashboard || defaultData);
      } catch (loadError) {
        setError(loadError.message || "Unable to load dashboard analytics.");
      } finally {
        setLoading(false);
      }
    }

    if (authToken) {
      load();
    }
  }, [authToken]);

  if (loading) {
    return <article className="panel active"><p className="section-caption">Loading dashboard analytics...</p></article>;
  }

  return (
    <article className="panel active">
      <div className="panel-head">
        <h2>Executive Dashboard</h2>
        <p>Premium analytics snapshot for adoption, confidence quality, workload patterns, and risk visibility.</p>
      </div>

      {error && <p className="section-caption">{error}</p>}

      <section className="kpi-grid">
        {data.kpis.map((item) => (
          <div key={item.label} className="kpi-card">
            <p>{item.label}</p>
            <strong>{item.value}</strong>
            <span>{item.trend} vs last month</span>
          </div>
        ))}
      </section>

      <section className="dash-grid charts-2up">
        <div className="dash-card chart-card">
          <h3>Multi-Channel Query Trend (Stacked Area)</h3>
          <svg viewBox="0 0 640 260" className="stacked-area" role="img" aria-label="Stacked area chart">
            <defs>
              <linearGradient id="chatFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="emailFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="voiceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fb923c" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#fb923c" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            <g className="chart-grid-lines">
              <line x1="50" y1="220" x2="610" y2="220" />
              <line x1="50" y1="170" x2="610" y2="170" />
              <line x1="50" y1="120" x2="610" y2="120" />
              <line x1="50" y1="70" x2="610" y2="70" />
            </g>

            <path d="M50 215 L150 195 L250 178 L350 182 L450 158 L550 140 L610 130 L610 220 L50 220 Z" fill="url(#voiceFill)" />
            <path d="M50 198 L150 172 L250 160 L350 152 L450 132 L550 122 L610 110 L610 220 L50 220 Z" fill="url(#emailFill)" />
            <path d="M50 184 L150 150 L250 128 L350 120 L450 96 L550 80 L610 66 L610 220 L50 220 Z" fill="url(#chatFill)" />

            <polyline points="50,184 150,150 250,128 350,120 450,96 550,80 610,66" className="line-chat" />
            <polyline points="50,198 150,172 250,160 350,152 450,132 550,122 610,110" className="line-email" />
            <polyline points="50,215 150,195 250,178 350,182 450,158 550,140 610,130" className="line-voice" />

            {data.stackedTrend.months.map((month, index) => (
              <text key={month} x={90 + index * 90} y="242" className="axis-label">{month}</text>
            ))}
          </svg>

          <div className="legend-row">
            <span><i className="dot chat" /> Chat</span>
            <span><i className="dot email" /> Email</span>
            <span><i className="dot voice" /> Voice</span>
          </div>
        </div>

        <div className="dash-card chart-card">
          <h3>Confidence Distribution</h3>
          <div className="donut-wrap">
            <div className="confidence-donut" />
            <div className="donut-center">
              <strong>{data.confidenceDistribution.average}%</strong>
              <p>Avg Confidence</p>
            </div>
          </div>
          <div className="legend-col">
            <span><i className="dot" style={{ background: "#16a34a" }} /> High: {data.confidenceDistribution.high}%</span>
            <span><i className="dot" style={{ background: "#f59e0b" }} /> Medium: {data.confidenceDistribution.medium}%</span>
            <span><i className="dot" style={{ background: "#ef4444" }} /> Low: {data.confidenceDistribution.low}%</span>
          </div>
        </div>
      </section>

      <section className="dash-grid charts-3up">
        <div className="dash-card">
          <h3>Daily Workload Heatmap</h3>
          <div className="calendar-heatmap">
            {data.heatmapCells.map((level, index) => (
              <span key={`hm-${index}`} className={`heat-cell lv-${level}`} />
            ))}
          </div>
          <div className="heat-legend">
            <small>Low</small>
            <span className="heat-cell lv-0" />
            <span className="heat-cell lv-1" />
            <span className="heat-cell lv-2" />
            <span className="heat-cell lv-3" />
            <span className="heat-cell lv-4" />
            <small>High</small>
          </div>
        </div>

        <div className="dash-card col-span-2">
          <h3>Top Budget Topics (Horizontal Bar)</h3>
          <div className="topic-bars">
            {data.topTopics.map((topic) => (
              <div key={topic.name} className="topic-row">
                <p>{topic.name}</p>
                <div className="topic-track">
                  <div className="topic-fill" style={{ width: `${topic.value}%` }} />
                </div>
                <strong>{topic.value}</strong>
              </div>
            ))}
          </div>
          <div className="list-box compact">
            {data.alerts.map((alert) => (
              <p key={alert}>{alert}</p>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}