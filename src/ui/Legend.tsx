import { useApp } from "../store";

interface Props {
  total: number;
  visible: number;
}

export function Legend({ total, visible }: Props) {
  const lastRefreshAt = useApp((s) => s.lastRefreshAt);
  return (
    <div className="legend">
      <div className="legend-counts">
        Visible: <strong>{visible.toLocaleString()}</strong> / {total.toLocaleString()}
      </div>
      <ul className="legend-swatches">
        <li>
          <span className="sw leo" />
          LEO
        </li>
        <li>
          <span className="sw meo" />
          MEO
        </li>
        <li>
          <span className="sw geo" />
          GEO
        </li>
        <li>
          <span className="sw heo" />
          HEO
        </li>
      </ul>
      {lastRefreshAt && <div className="legend-refresh">TLE refreshed {lastRefreshAt}</div>}
    </div>
  );
}
