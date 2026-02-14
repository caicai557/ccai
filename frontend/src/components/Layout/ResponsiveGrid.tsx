import React from 'react';
import { Row, Col } from 'antd';
import type { RowProps, ColProps } from 'antd';

interface ResponsiveGridProps extends RowProps {
  children: React.ReactNode;
  cols?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
    xxl?: number;
  };
}

/**
 * 响应式网格布局组件
 * 提供统一的响应式列布局
 */
const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  cols = { xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 6 },
  gutter = 16,
  ...rest
}) => {
  // 计算每列的span值
  const getColSpan = (): ColProps => {
    return {
      xs: cols.xs ? 24 / cols.xs : 24,
      sm: cols.sm ? 24 / cols.sm : 12,
      md: cols.md ? 24 / cols.md : 8,
      lg: cols.lg ? 24 / cols.lg : 6,
      xl: cols.xl ? 24 / cols.xl : 6,
      xxl: cols.xxl ? 24 / cols.xxl : 4,
    };
  };

  const colSpan = getColSpan();

  return (
    <Row gutter={gutter} {...rest}>
      {React.Children.map(children, (child) => (
        <Col {...colSpan}>{child}</Col>
      ))}
    </Row>
  );
};

export default ResponsiveGrid;
