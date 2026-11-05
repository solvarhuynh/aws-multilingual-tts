import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Icon, ToolArt } from "../components/ui";
import { formatNumber, languageNames, shortDate } from "../lib/data";
import type { HistoryItem, Language, Page, Stats } from "../lib/types";

export default function Dashboard({
  history,
  languages,
  navigate,
  openRecording,
}: {
  history: HistoryItem[];
  languages: Language[];
  navigate: (page: Page) => void;
  openRecording: (item: HistoryItem) => Promise<void>;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .stats()
      .then((result) => {
        if (active) {
          setStats(result);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [history]);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + i);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      label: date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      }),
      count: history.filter((item) => {
        const d = new Date(item.createdAt);
        return (
          d.getFullYear() === date.getFullYear() &&
          d.getMonth() === date.getMonth() &&
          d.getDate() === date.getDate()
        );
      }).length,
    };
  });
  const maxCount = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="dashboard page-content">
      <div className="dashboard-tools">
        <section className="featured-tool" aria-labelledby="featured-tool-title">
          <div className="featured-copy">
            <h2 id="featured-tool-title">Tạo giọng đọc</h2>
            <p>Chuyển văn bản thành giọng nói.</p>
            <Button className="primary-button" onClick={() => navigate("studio")}>
              Tạo bản thu
              <Icon name="arrow" size={16} />
            </Button>
          </div>
          <ToolArt />
        </section>
        <div className="companion-tools">
          {[
            {
              id: "translation" as const,
              title: "Dịch và đọc",
              description: "Dịch và đọc đa ngôn ngữ",
              icon: "translate",
            },
            {
              id: "documents" as const,
              title: "Đọc tài liệu",
              description: "Đọc PDF, Word và văn bản dài",
              icon: "book",
            },
          ].map((tool) => (
            <Button className="companion-tool" key={tool.id} onClick={() => navigate(tool.id)}>
              <span className="companion-icon">
                <Icon name={tool.icon} size={22} />
              </span>
              <span>
                <strong>{tool.title}</strong>
                <small>{tool.description}</small>
              </span>
              <Icon name="arrow" size={17} />
            </Button>
          ))}
        </div>
      </div>
      <div className="overview-stats">
        {[
          {
            title: "Bản thu đã tạo",
            value: stats ? formatNumber(stats.totalJobs) : "—",
            icon: "headphones",
          },
          {
            title: "Ký tự đã xử lý",
            value: stats ? formatNumber(stats.totalChars) : "—",
            icon: "file",
          },
          {
            title: "Ngôn ngữ",
            value: formatNumber(languages.length),
            icon: "translate",
          },
        ].map((stat) => (
          <article className="overview-stat surface" key={stat.title}>
            <span className="stat-icon">
              <Icon name={stat.icon} size={19} />
            </span>
            <div>
              <small>{stat.title}</small>
              <strong>{stat.value}</strong>
            </div>
          </article>
        ))}
      </div>
      {error && <p className="dashboard-error">Chưa tải được thống kê. Bạn vẫn có thể tạo bản thu.</p>}
      <div className="dashboard-bottom">
        <section className="recent-card surface">
          <div className="section-title">
            <h2>Bản thu gần đây</h2>
            <Button className="text-button" onClick={() => navigate("library")}>
              Xem tất cả
              <Icon name="arrow" size={14} />
            </Button>
          </div>
          {history.length ? (
            <div className="recent-records">
              {history.slice(0, 3).map((item) => (
                <Button key={item.jobId} onClick={() => void openRecording(item)}>
                  <span className="recent-play">
                    <Icon name={item.status === "DONE" ? "play" : "clock"} size={14} />
                  </span>
                  <span>
                    <strong>{item.text.slice(0, 49)}</strong>
                    <small>
                      {languageNames[item.lang] || item.lang} · {shortDate(item.createdAt)}
                    </small>
                  </span>
                  <Icon name="arrow" size={14} />
                </Button>
              ))}
            </div>
          ) : (
            <div className="recent-empty">
              <Icon name="headphones" size={23} />
              <p>Chưa có bản thu</p>
            </div>
          )}
        </section>
        <section className="activity-card surface">
          <div className="section-title">
            <h2>Hoạt động gần đây</h2>
            <span>7 ngày</span>
          </div>
          {days.some((day) => day.count > 0) ? (
            <div
              className="activity-chart"
              role="img"
              aria-label={days.map((d) => `${d.label}: ${d.count} bản thu`).join(", ")}
            >
              {days.map((d) => (
                <div key={d.key}>
                  <div className="activity-column">
                    <span
                      style={{
                        height: `${d.count ? 8 + (d.count / maxCount) * 92 : 3}%`,
                      }}
                    />
                    <small>{d.count || ""}</small>
                  </div>
                  <time>{d.label}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className="activity-empty">
              <p>Chưa có hoạt động trong 7 ngày.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
