import React from "react";
import { Link } from "react-router-dom";
import { LuChevronRight, LuHardDrive, LuFolder } from "react-icons/lu";

export function Breadcrumbs({ items = [] }) {
  if (!items || items.length === 0) return null;

  return (
    <nav className="breadcrumbs-bar" aria-label="Directory Breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const to = item.id ? `/directory/${item.id}` : "/";

        return (
          <React.Fragment key={item.id || "root"}>
            {index > 0 && <LuChevronRight className="breadcrumb-separator" />}
            {isLast ? (
              <span className="breadcrumb-item current" aria-current="page">
                {index === 0 ? <LuHardDrive /> : <LuFolder />}
                <span>{item.name}</span>
              </span>
            ) : (
              <Link to={to} className="breadcrumb-item">
                {index === 0 ? <LuHardDrive /> : <LuFolder />}
                <span>{item.name}</span>
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
