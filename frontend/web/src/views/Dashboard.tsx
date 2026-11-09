import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { Button, Icon, Spinner, ToolArt } from "../components/ui";
import { formatNumber, languageNames, shortDate } from "../lib/data";
import type { HistoryItem, Language, Page, Stats } from "../lib/types";

export default function Dashboard({
  history,
  languages,
  navigate,
  openRecording,
  playingJobId,
  loadingHistory,
  historyError,
  reloadHistory,
  hasMoreHistory,
}: {
  history: HistoryItem[];
  languages: Language[];
  navigate: (page: Page) => void;
  openRecording: (item: HistoryItem) => Promise<void>;
  playingJobId: string | null;
  loadingHistory: boolean;
  historyError: string;
  reloadHistory: () => Promise<void>;
  hasMoreHistory: boolean;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsState, setStatsState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [statsRequest, setStatsRequest] = useState(0);
  useEffect(() => {
    let active = true;
    setStatsState("loading");
    api
      .stats()
      .then((result) => {
        if (active) {
          setStats(result);
          setStatsState("ready");
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setStats(null);
          setStatsState(reason instanceof ApiError && reason.status === 503 ? "unavailable" : "error");
        }
      });
    return () => {
      active = false;
    };
  }, [history, statsRequest]);
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
            <p>Dán nội dung, chọn giọng rồi nghe lại.</p>
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
              description: "Đổi ngôn ngữ trước khi tạo giọng",
              icon: "translate",
            },
            {
              id: "documents" as const,
              title: "Đọc tài liệu",
              description: "Nhập nội dung từ PDF, Word hoặc TXT",
              icon: "book",
            },
          ].map((tool) => (
            <Button className="companion-tool" key={tool.id} onClick={() => navigate(tool.id)}>
              <Icon name={tool.icon} size={26} className="companion-icon" />
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
            value: statsState === "ready" && stats ? formatNumber(stats.totalJobs) : "—",
            icon: "headphones",
          },
          {
            title: "Ký tự đã xử lý",
            value: statsState === "ready" && stats ? formatNumber(stats.totalChars) : "—",
            icon: "file",
          },
          {
            title: "Ngôn ngữ hỗ trợ",
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
      {statsState === "loading" && <p className="dashboard-note" role="status">Đang tải thống kê…</p>}
      {statsState === "ready" && stats?.totalJobs === 0 &&
        <p className="dashboard-note" role="status">Chưa có bản thu. Thống kê sẽ cập nhật sau khi bạn tạo giọng đọc.</p>}
      {(statsState === "unavailable" || statsState === "error") &&
        <div className="dashboard-error" role="alert">
          <span>{statsState === "unavailable"
            ? "Thống kê tạm chưa sẵn sàng. Lịch sử và tạo giọng vẫn dùng được."
            : "Chưa tải được thống kê. Bạn vẫn có thể tạo bản thu."}</span>
          <Button className="text-button" onClick={() => setStatsRequest((value) => value + 1)}>Thử tải lại</Button>
        </div>}
      <div className="dashboard-bottom">
        <section className="recent-card surface">
          <div className="section-title">
            <h2>Bản thu gần đây</h2>
            <Button className="text-button" onClick={() => navigate("library")}>
              Xem tất cả
              <Icon name="arrow" size={14} />
            </Button>
          </div>
          {loadingHistory && !history.length ? <div className="recent-empty" role="status"><Spinner /><p>Đang tải bản thu…</p></div>
            : historyError && !history.length ? <div className="recent-empty"><p>{historyError}</p><Button className="text-button" onClick={() => void reloadHistory()}>Tải lại lịch sử</Button></div>
            : history.length ? (
            <div className="recent-records">
              {history.slice(0, 3).map((item) => (
                <Button key={item.jobId} onClick={() => void openRecording(item)}
                  aria-label={`${playingJobId === item.jobId ? "Tạm dừng" : item.status === "DONE" ? "Phát" : "Xem trạng thái"}: ${item.text.slice(0, 49)}`}>
                  <span className="recent-play">
                    <Icon name={playingJobId === item.jobId ? "pause" : item.status === "DONE" ? "play" : item.status === "FAILED" ? "alert" : "clock"} size={14} />
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
              <Button className="text-button" onClick={() => navigate("studio")}>Tạo bản thu đầu tiên<Icon name="arrow" size={14} /></Button>
            </div>
          )}
        </section>
        <section className="activity-card surface">
          <div className="section-title">
            <h2>Hoạt động gần đây</h2>
            <span>7 ngày</span>
          </div>
          {loadingHistory && !history.length ? <div className="activity-empty"><Spinner /><p>Đang tải hoạt động…</p></div>
            : historyError && !history.length ? <div className="activity-empty"><p>Hoạt động sẽ hiển thị khi tải được lịch sử.</p></div>
            : days.some((day) => day.count > 0) ? (
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
          {hasMoreHistory && <p className="activity-note">Thống kê từ các bản thu đã tải.</p>}
        </section>
      </div>
    </div>
  );
}
