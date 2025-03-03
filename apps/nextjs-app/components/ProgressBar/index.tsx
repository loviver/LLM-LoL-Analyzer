import React from "react";
import styles from "./index.module.css";

const ProgressBar = ({ value, max, color = "#00ff00" } : {
  value: number;
  max: number;
  color?: string;
}) => {
  const percentage = (value / max) * 100;

  return (
    <div className={styles["progress-container"]}>
      <div
        className={styles["progress-bar"]}
        style={{ width: `${percentage}%`, backgroundColor: color }}
      ></div>
    </div>
  );
};

export default ProgressBar;
