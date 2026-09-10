import { useTranslation } from "react-i18next";
import {
	Bar,
	BarChart,
	CartesianGrid,
	LabelList,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useColorScheme } from "../../lib/useColorScheme";
import type { WasteRateRow } from "./computeWasteRateRanking";

// Same "wasted" orange as WasteTrendChart — one series here, so no CVD
// separation check applies, but reusing it keeps "orange = waste" consistent
// across the tab.
const SERIES_COLOR = { light: "#eb6834", dark: "#d95926" };

const BAR_HEIGHT = 40;
const CHART_PADDING = 48;

interface WasteRateRankingChartProps {
	data: WasteRateRow[];
}

export function WasteRateRankingChart({ data }: WasteRateRankingChartProps) {
	const { t } = useTranslation();
	const isDark = useColorScheme();
	const color = isDark ? SERIES_COLOR.dark : SERIES_COLOR.light;

	const chartData = data.map((row) => {
		const percent = Math.round(row.rate * 100);
		return {
			...row,
			percent,
			// A raw percentage alone can look scarier than it is on a small
			// sample (e.g. 1 of 2) — the fraction rides along on every bar so
			// it's never hidden behind just the rate.
			rangeLabel: t("insights.wasteRateLabel", {
				percent,
				wasted: row.wasted,
				total: row.total,
			}),
		};
	});

	return (
		<ResponsiveContainer
			width="100%"
			height={chartData.length * BAR_HEIGHT + CHART_PADDING}
		>
			<BarChart
				data={chartData}
				layout="vertical"
				margin={{ top: 8, right: 110, left: 0, bottom: 8 }}
			>
				<CartesianGrid stroke="var(--border)" horizontal={false} />
				<XAxis type="number" domain={[0, 100]} unit="%" stroke="var(--text)" />
				<YAxis
					type="category"
					dataKey="label"
					width={110}
					stroke="var(--text)"
				/>
				<Tooltip
					formatter={(_value, _name, item) => [
						item.payload.rangeLabel,
						t("insights.sectionWasteRanking"),
					]}
				/>
				<Bar dataKey="percent" fill={color} radius={[0, 4, 4, 0]} barSize={24}>
					<LabelList dataKey="rangeLabel" position="right" fill="var(--text)" />
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}
