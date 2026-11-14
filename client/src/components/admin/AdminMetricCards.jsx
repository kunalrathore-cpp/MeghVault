import React from "react";
import { LuUsers, LuUserCheck } from "react-icons/lu";

export function AdminMetricCards({ stats }) {
  const {
    totalUsers = 0,
    activeUsers = 0,
  } = stats || {};

  return (
    <div className="admin-metrics-grid">
      {/* 1. Total Users Card */}
      <div className="admin-metric-card blue-theme">
        <div className="metric-icon-bubble blue">
          <LuUsers size={22} />
        </div>
        <div className="metric-details">
          <span className="metric-label">Total Users</span>
          <div className="metric-value-row">
            <span className="metric-value">{totalUsers}</span>
          </div>
        </div>
      </div>

      {/* 2. Active Users Card */}
      <div className="admin-metric-card green-theme">
        <div className="metric-icon-bubble green">
          <LuUserCheck size={22} />
        </div>
        <div className="metric-details">
          <span className="metric-label">Active Users</span>
          <div className="metric-value-row">
            <span className="metric-value">{activeUsers}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
