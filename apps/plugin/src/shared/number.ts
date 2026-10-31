/**
 * 把数字收进一个区间。
 *
 * 原来这个四行函数在五个地方各写了一遍（颜色换算、画布几何、面板宽度、
 * 导出倍率、属性栏输入），每一处都写成 `Math.min(max, Math.max(min, v))`。
 * 参数顺序一不留神就写反，而且读的人得先确认两个操作数的顺序。
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 同上，再四舍五入成整数。数量、列数这类“只能是整数个”的值用它。 */
export function clampInt(value: number, min: number, max: number): number {
  return clamp(Math.round(value), min, max);
}

/**
 * 输入框里的百分比（0–100）换成模型里的比例（0–1），顺手夹住范围。
 *
 * 不透明度、通道透明度都是这个形状，原来四处各写一遍同样的夹取再除一百。
 */
export function ratioFromPercent(percent: number): number {
  return clamp(percent, 0, 100) / 100;
}
