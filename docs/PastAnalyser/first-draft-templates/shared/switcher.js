// Persistent Navigation Switcher Component for Past Analyser UI Prototypes
(function() {
  const designs = [
    { id: "hub", name: "🏠 All Designs Hub", path: "/index.html", desc: "Overview & Comparison Hub" },
    { id: "1-ops-cockpit", name: "1. Ops Cockpit", path: "/designs/1-ops-cockpit/index.html", desc: "Datadog / Cloud Cost Telemetry Dashboard" },
    { id: "2-workflow-graph", name: "2. Workflow Graph Canvas", path: "/designs/2-workflow-graph/index.html", desc: "Node Graph, Loop Heatmaps & Split/Combine Canvas" },
    { id: "3-devtools-studio", name: "3. DevTools Studio", path: "/designs/3-devtools-studio/index.html", desc: "IDE Diagnostic Profiler & Inline AGENTS.md / Code Diff" },
    { id: "4-copilot-feed", name: "4. Copilot Action Feed", path: "/designs/4-copilot-feed/index.html", desc: "Proactive Optimization Stream & Simulation Cards" },
    { id: "5-pivot-matrix", name: "5. Analytical Pivot Matrix", path: "/designs/5-pivot-matrix/index.html", desc: "Multi-Dimensional Pivot Table & Cost BI Grid" }
  ];

  function getCurrentDesignId() {
    const p = window.location.pathname;
    for (const d of designs) {
      if (d.id !== "hub" && p.includes(d.id)) return d.id;
    }
    return "hub";
  }

  function initSwitcher() {
    // Avoid double render
    if (document.getElementById("pa-global-switcher")) return;

    const currentId = getCurrentDesignId();

    const switcherContainer = document.createElement("div");
    switcherContainer.id = "pa-global-switcher";
    switcherContainer.innerHTML = `
      <style>
        #pa-global-switcher {
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          z-index: 99999;
          background: rgba(11, 15, 23, 0.94);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid #24344d;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          color: #f1f5f9;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .pa-sw-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #38bdf8;
          text-decoration: none;
        }
        .pa-sw-brand span {
          background: linear-gradient(135deg, #38bdf8, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          font-size: 14px;
        }
        .pa-sw-pills {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          padding: 2px 4px;
        }
        .pa-sw-pill {
          padding: 5px 11px;
          border-radius: 6px;
          background: #162032;
          color: #94a3b8;
          text-decoration: none;
          font-weight: 500;
          font-size: 12px;
          white-space: nowrap;
          border: 1px solid #24344d;
          transition: all 0.15s ease;
        }
        .pa-sw-pill:hover {
          color: #fff;
          background: #1e2c44;
          border-color: #38bdf8;
        }
        .pa-sw-pill.active {
          background: #0284c7;
          color: #fff;
          border-color: #38bdf8;
          font-weight: 600;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
        }
        .pa-sw-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pa-sw-btn {
          background: #162032;
          color: #94a3b8;
          border: 1px solid #24344d;
          border-radius: 6px;
          padding: 5px 10px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: all 0.15s ease;
        }
        .pa-sw-btn:hover {
          color: #f1f5f9;
          background: #1e2c44;
          border-color: #64748b;
        }
        .pa-sw-modal {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          z-index: 100000;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .pa-sw-modal.open {
          display: flex;
        }
        .pa-sw-modal-content {
          background: #0f172a;
          border: 1px solid #33486a;
          border-radius: 12px;
          width: 90%;
          max-width: 860px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 35px rgba(0,0,0,0.6);
        }
        .pa-sw-modal-header {
          padding: 14px 20px;
          border-bottom: 1px solid #24344d;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .pa-sw-modal-body {
          padding: 20px;
          overflow-y: auto;
          color: #cbd5e1;
          font-size: 13px;
        }
        .pa-sw-json {
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 14px;
          font-family: monospace;
          font-size: 12px;
          color: #38bdf8;
          white-space: pre-wrap;
          max-height: 55vh;
          overflow-y: auto;
        }
      </style>

      <div class="pa-sw-brand">
        <span>⚡ KainBain Past Analyser</span>
        <span style="font-size:10px; color:#64748b; font-weight:normal; border-left:1px solid #33486a; padding-left:8px;">Layout Drafts</span>
      </div>

      <div class="pa-sw-pills">
        ${designs.map(d => `
          <a href="${d.path}" class="pa-sw-pill ${d.id === currentId ? 'active' : ''}" title="${d.desc}">
            ${d.name}
          </a>
        `).join("")}
      </div>

      <div class="pa-sw-actions">
        <button class="pa-sw-btn" id="pa-btn-data" title="Inspect shared mock data">
          📊 Mock Data JSON
        </button>
        <button class="pa-sw-btn" id="pa-btn-features" title="View initial idea features mapping">
          🎯 Feature Map
        </button>
      </div>

      <div class="pa-sw-modal" id="pa-modal-container">
        <div class="pa-sw-modal-content">
          <div class="pa-sw-modal-header">
            <h3 id="pa-modal-title" style="margin:0; font-size:15px; font-weight:600; color:#f8fafc;">Modal</h3>
            <button class="pa-sw-btn" id="pa-modal-close" style="padding:2px 8px;">✕</button>
          </div>
          <div class="pa-sw-modal-body" id="pa-modal-body"></div>
        </div>
      </div>
    `;

    document.body.prepend(switcherContainer);

    // Modal listeners
    const modal = document.getElementById("pa-modal-container");
    const modalTitle = document.getElementById("pa-modal-title");
    const modalBody = document.getElementById("pa-modal-body");
    const modalClose = document.getElementById("pa-modal-close");

    modalClose.addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("open");
    });

    document.getElementById("pa-btn-data").addEventListener("click", () => {
      modalTitle.textContent = "Shared Mock Data (Used Across All 5 Designs)";
      const rawData = window.PAST_ANALYSER_MOCK_DATA || {};
      modalBody.innerHTML = `
        <p style="margin-bottom:12px; color:#94a3b8;">
          All 5 templates bind to this single normalized dataset to demonstrate how radically different UX paradigms represent the same underlying project telemetry.
        </p>
        <pre class="pa-sw-json">${JSON.stringify(rawData, null, 2)}</pre>
      `;
      modal.classList.add("open");
    });

    document.getElementById("pa-btn-features").addEventListener("click", () => {
      modalTitle.textContent = "InitialIdea.md Feature Coverage Matrix";
      modalBody.innerHTML = `
        <div style="line-height:1.6;">
          <h4 style="color:#38bdf8; margin-bottom:8px;">Features from InitialIdea.md & Where They Appear:</h4>
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:12px; margin-top:8px;">
            <thead>
              <tr style="border-bottom:1px solid #33486a; color:#94a3b8;">
                <th style="padding:6px;">Initial Idea Feature</th>
                <th style="padding:6px;">Mock Implementation Details</th>
                <th style="padding:6px;">Primary Design Showcase</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:8px; font-weight:600; color:#f1f5f9;">AGENTS.md Optimizer</td>
                <td style="padding:8px;">Scans agents.md, gemini.md, claude.md for duplicate rules, suggests -63% token reduction diff.</td>
                <td style="padding:8px;"><span class="badge badge-purple">Design 3: DevTools Studio</span></td>
              </tr>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:8px; font-weight:600; color:#f1f5f9;">Agent Tool / Skill Creator</td>
                <td style="padding:8px;">Synthesizes CLI binaries & MCP skill wrappers from recurring raw git diff / SecObserve dumps.</td>
                <td style="padding:8px;"><span class="badge badge-emerald">Design 4: Copilot Feed & Design 2</span></td>
              </tr>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:8px; font-weight:600; color:#f1f5f9;">Refactor Needed Detector</td>
                <td style="padding:8px;">Flags monolithic files (e.g. api/agentRunner.js) causing prompt bloat in 82% of sessions.</td>
                <td style="padding:8px;"><span class="badge badge-rose">Design 3 & Design 5</span></td>
              </tr>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:8px; font-weight:600; color:#f1f5f9;">DORA Metric Analyser (Cost-Only)</td>
                <td style="padding:8px;">Tracks Cost per Success ($0.041), Token Rework Ratio (26.8%), Change Fail Waste ($48.20).</td>
                <td style="padding:8px;"><span class="badge badge-cyan">Design 1: Ops Cockpit</span></td>
              </tr>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:8px; font-weight:600; color:#f1f5f9;">Workflow Analyser (First Pass / Loops)</td>
                <td style="padding:8px;">Detects 198 retry loops in Impl<->Review; split/combine advice for parallel subagents.</td>
                <td style="padding:8px;"><span class="badge badge-amber">Design 2: Workflow Graph Canvas</span></td>
              </tr>
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:8px; font-weight:600; color:#f1f5f9;">Token Tracking & Cost Estimates</td>
                <td style="padding:8px;">Breakdown by provider (Anthropic, Google, Ollama Cloud) and daily spend trends.</td>
                <td style="padding:8px;"><span class="badge badge-blue">Design 1 & Design 5</span></td>
              </tr>
              <tr>
                <td style="padding:8px; font-weight:600; color:#f1f5f9;">Model Downgrade / Upgrade Radar</td>
                <td style="padding:8px;">Downgrades Claude 3.7 to DeepSeek V4 Flash for Plan; Upgrades Qwen 2.5 on high fail rates.</td>
                <td style="padding:8px;"><span class="badge badge-emerald">All Designs</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
      modal.classList.add("open");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSwitcher);
  } else {
    initSwitcher();
  }
})();
