import { useEffect, useState } from "react";
import { getBudgetForecast } from "../../services/insightsApi.js";

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmt$(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: "0.95rem", color: "#003a70", fontWeight: 700 }}>{title}</h3>
      {subtitle && <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#666" }}>{subtitle}</p>}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 8, border: "1px solid #e0e4ea",
      padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", ...style
    }}>
      {children}
    </div>
  );
}

// Grouped horizontal bar chart for YoY data
function YoYChart({ data }) {
  if (!data?.length) return <p style={{ color: "#888", fontSize: "0.83rem" }}>No multi-year data yet.</p>;

  const maxVal = Math.max(...data.flatMap((d) => [d.totalRequested, d.approvedAmount]));
  const barMax = maxVal || 1;

  return (
    <div>
      {data.map((row) => (
        <div key={row.fiscalYear} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#003a70" }}>{row.fiscalYear}</span>
            <span style={{ fontSize: "0.78rem", color: "#666" }}>
              {row.requestCount} request{row.requestCount !== 1 ? "s" : ""}
            </span>
          </div>
          {/* Requested bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <div style={{ width: 70, fontSize: "0.72rem", color: "#888", textAlign: "right", flexShrink: 0 }}>Requested</div>
            <div style={{ flex: 1, background: "#f0f3f7", borderRadius: 3, height: 14, overflow: "hidden" }}>
              <div style={{
                width: `${Math.round((row.totalRequested / barMax) * 100)}%`,
                height: "100%", background: "#2980b9", borderRadius: 3, transition: "width 0.4s"
              }} />
            </div>
            <div style={{ width: 60, fontSize: "0.72rem", color: "#2980b9", fontWeight: 600, flexShrink: 0 }}>
              {fmt$(row.totalRequested)}
            </div>
          </div>
          {/* Approved bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 70, fontSize: "0.72rem", color: "#888", textAlign: "right", flexShrink: 0 }}>Approved</div>
            <div style={{ flex: 1, background: "#f0f3f7", borderRadius: 3, height: 14, overflow: "hidden" }}>
              <div style={{
                width: `${Math.round((row.approvedAmount / barMax) * 100)}%`,
                height: "100%", background: "#27ae60", borderRadius: 3, transition: "width 0.4s"
              }} />
            </div>
            <div style={{ width: 60, fontSize: "0.72rem", color: "#27ae60", fontWeight: 600, flexShrink: 0 }}>
              {fmt$(row.approvedAmount)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Horizontal status pipeline bars
const STATUS_COLORS = {
  draft:        "#95a5a6",
  submitted:    "#8e44ad",
  under_review: "#2980b9",
  approved:     "#27ae60",
  denied:       "#e74c3c",
  on_hold:      "#f39c12"
};

function PipelineChart({ data }) {
  if (!data?.length) return <p style={{ color: "#888", fontSize: "0.83rem" }}>No pipeline data yet.</p>;

  const maxCount = Math.max(...data.map((d) => d.count)) || 1;

  return (
    <div>
      {data.map((row) => {
        const color = STATUS_COLORS[row.status] || "#999";
        const pct = Math.round((row.count / maxCount) * 100);
        return (
          <div key={row.status} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
            <div style={{
              width: 86, fontSize: "0.75rem", fontWeight: 600, color,
              textTransform: "capitalize", textAlign: "right", flexShrink: 0
            }}>
              {row.status.replace("_", " ")}
            </div>
            <div style={{ flex: 1, background: "#f0f3f7", borderRadius: 4, height: 18, overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`, height: "100%", background: color,
                borderRadius: 4, transition: "width 0.4s",
                display: "flex", alignItems: "center", paddingLeft: 6
              }}>
                {pct > 18 && (
                  <span style={{ fontSize: "0.68rem", color: "#fff", fontWeight: 700 }}>{row.count}</span>
                )}
              </div>
            </div>
            <div style={{ width: 52, fontSize: "0.72rem", color: "#555", flexShrink: 0 }}>
              {fmt$(row.total)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Department breakdown horizontal bars
function DeptChart({ data }) {
  if (!data?.length) return <p style={{ color: "#888", fontSize: "0.83rem" }}>No department data yet.</p>;

  const max = Math.max(...data.map((d) => d.totalRequested)) || 1;

  return (
    <div>
      {data.map((row) => {
        const approvalPct = row.totalRequested > 0
          ? Math.round((row.approvedAmount / row.totalRequested) * 100)
          : 0;
        return (
          <div key={row.department} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#222" }}>{row.department}</span>
              <span style={{ fontSize: "0.74rem", color: "#888" }}>
                {approvalPct}% approved · {row.requestCount} req
              </span>
            </div>
            <div style={{ position: "relative", height: 16, background: "#f0f3f7", borderRadius: 4, overflow: "hidden" }}>
              {/* total requested */}
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${Math.round((row.totalRequested / max) * 100)}%`,
                background: "#b5ccdf", borderRadius: 4
              }} />
              {/* approved portion */}
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${Math.round((row.approvedAmount / max) * 100)}%`,
                background: "#27ae60", borderRadius: 4, opacity: 0.8
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              <span style={{ fontSize: "0.7rem", color: "#888" }}>Total: {fmt$(row.totalRequested)}</span>
              <span style={{ fontSize: "0.7rem", color: "#27ae60" }}>Approved: {fmt$(row.approvedAmount)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Monthly approval rate trend as a mini SVG line chart
function ApprovalTrendChart({ data }) {
  if (!data?.length) return <p style={{ color: "#888", fontSize: "0.83rem" }}>No trend data yet.</p>;

  const W = 540, H = 100, PAD = { top: 10, right: 10, bottom: 28, left: 30 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const rates  = data.map((d) => d.rate);
  const maxR   = Math.max(...rates, 100);
  const n      = data.length;

  function x(i) { return PAD.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2); }
  function y(v) { return PAD.top + innerH - (v / maxR) * innerH; }

  const linePts = data.map((d, i) => `${x(i)},${y(d.rate)}`).join(" ");
  const areaPath = [
    `M ${x(0)} ${y(0)}`,
    ...data.map((d, i) => `L ${x(i)} ${y(d.rate)}`),
    `L ${x(n - 1)} ${PAD.top + innerH}`,
    `L ${x(0)} ${PAD.top + innerH}`, "Z"
  ].join(" ");

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)}
              stroke="#eef0f3" strokeWidth="1" />
            <text x={PAD.left - 4} y={y(v) + 4} fontSize="9" fill="#bbb" textAnchor="end">{v}%</text>
          </g>
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="#003a70" fillOpacity="0.08" />
        {/* Line */}
        <polyline points={linePts} fill="none" stroke="#003a70" strokeWidth="2" strokeLinejoin="round" />
        {/* Dots + labels */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.rate)} r="4" fill="#003a70" />
            <text x={x(i)} y={y(d.rate) - 8} fontSize="9" fill="#003a70" textAnchor="middle" fontWeight="600">
              {d.rate}%
            </text>
            <text x={x(i)} y={H - 4} fontSize="9" fill="#888" textAnchor="middle">{d.month}</text>
          </g>
        ))}
      </svg>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: "0.73rem", color: "#666" }}>
        {data.map((d, i) => (
          <span key={i} style={{ whiteSpace: "nowrap" }}>
            {d.month}: <strong style={{ color: "#27ae60" }}>{d.approved} ✓</strong>
            {" / "}
            <strong style={{ color: "#e74c3c" }}>{d.denied} ✗</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BudgetForecastPanel({ authToken }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    getBudgetForecast(authToken)
      .then(({ forecast }) => setData(forecast))
      .catch((e) => setError(e.message || "Failed to load forecast"))
      .finally(() => setLoading(false));
  }, [authToken]);

  // KPI strip
  const totalRequested = data?.yearOverYear?.reduce((s, r) => s + r.totalRequested, 0) ?? 0;
  const totalApproved  = data?.yearOverYear?.reduce((s, r) => s + r.approvedAmount, 0) ?? 0;
  const totalRequests  = data?.yearOverYear?.reduce((s, r) => s + r.requestCount, 0) ?? 0;
  const overallApprovalRate = totalRequested > 0
    ? Math.round((totalApproved / totalRequested) * 100) : 0;

  const kpis = [
    { label: "Total Requested",   value: fmt$(totalRequested), color: "#2980b9" },
    { label: "Total Approved",    value: fmt$(totalApproved),  color: "#27ae60" },
    { label: "Total Requests",    value: String(totalRequests), color: "#8e44ad" },
    { label: "Overall Approval %", value: `${overallApprovalRate}%`, color: "#f39c12" }
  ];

  return (
    <article className="panel active">
      <header className="panel-head">
        <h2>Budget Forecast &amp; Analytics</h2>
        <p>Multi-year spending trends, request pipeline, department breakdown, and approval rates.</p>
      </header>

      {loading && (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "#888" }}>Loading forecast data…</div>
      )}
      {error && (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ background: "#fff0f0", border: "1px solid #f5c6cb", borderRadius: 6, padding: "12px 16px", color: "#c0392b", fontSize: "0.85rem" }}>
            {error}
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ padding: "0 24px 32px" }}>

          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{
                background: "#fff", border: "1px solid #e0e4ea", borderRadius: 8,
                padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
              }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: "0.75rem", color: "#777", marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Two-column grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 20, marginBottom: 20 }}>

            <Card>
              <SectionHeader
                title="Year-over-Year Comparison"
                subtitle="Total requested vs. approved amounts by fiscal year"
              />
              <YoYChart data={data.yearOverYear} />
            </Card>

            <Card>
              <SectionHeader
                title="Request Pipeline"
                subtitle="Current status distribution with dollar totals"
              />
              <PipelineChart data={data.pipeline} />
            </Card>

          </div>

          {/* Full-width department chart */}
          <Card style={{ marginBottom: 20 }}>
            <SectionHeader
              title="Department Budget Breakdown"
              subtitle="Top departments by total requested amount — green overlay shows approved portion"
            />
            <DeptChart data={data.departmentBreakdown} />
          </Card>

          {/* Full-width approval trend */}
          <Card>
            <SectionHeader
              title="Monthly Approval Rate Trend"
              subtitle="Percentage of reviewed requests approved — last 6 months"
            />
            <ApprovalTrendChart data={data.approvalTrend} />
          </Card>

        </div>
      )}
    </article>
  );
}
