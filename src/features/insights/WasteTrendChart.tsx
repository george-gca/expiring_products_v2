import { useTranslation } from "react-i18next";
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useColorScheme } from "../../lib/useColorScheme";
import type { MonthlyWasteTrend } from "./aggregateWasteTrend";

// Validated against the dataviz skill's CVD-safety checker (OKLab ΔE): antd's
// default colorSuccess/colorError green-red pair fails deuteranopia separation
// (ΔE 4.9, below the 6.0 floor), so this reuses the skill's reference
// categorical slots 1 (blue) and 2 (orange) instead — ΔE 24.7+ in both modes.
// Identity still isn't color-alone: the legend + tooltip name each series.
const SERIES_COLOR = {
	light: { consumedInTime: "#2a78d6", wasted: "#eb6834", surface: "#fcfcfb" },
	dark: { consumedInTime: "#3987e5", wasted: "#d95926", surface: "#1a1a19" },
};

interface WasteTrendChartProps {
	data: MonthlyWasteTrend[];
}

export function WasteTrendChart({ data }: WasteTrendChartProps) {
	const { t, i18n } = useTranslation();
	const isDark = useColorScheme();
	const colors = isDark ? SERIES_COLOR.dark : SERIES_COLOR.light;

	const chartData = data.map((row) => ({
		...row,
		monthLabel: new Date(row.year, row.month, 1).toLocaleDateString(
			i18n.language,
			{ year: "numeric", month: "short" },
		),
	}));

	return (
		<ResponsiveContainer width="100%" height={280}>
			<LineChart
				data={chartData}
				margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
			>
				<CartesianGrid stroke="var(--border)" />
				<XAxis dataKey="monthLabel" stroke="var(--text)" />
				<YAxis allowDecimals={false} stroke="var(--text)" />
				<Tooltip />
				{/* Recharts colors legend text with the series color by default —
				the dataviz skill requires text to stay in a neutral text token,
				with identity carried by the swatch icon instead. */}
				<Legend
					formatter={(value) => (
						<span style={{ color: "var(--text)" }}>{value}</span>
					)}
				/>
				<Line
					type="monotone"
					dataKey="consumedInTime"
					name={t("insights.consumedInTime")}
					stroke={colors.consumedInTime}
					strokeWidth={2}
					dot={{ r: 4, strokeWidth: 2, stroke: colors.surface }}
					activeDot={{ r: 4, strokeWidth: 2, stroke: colors.surface }}
				/>
				<Line
					type="monotone"
					dataKey="wasted"
					name={t("insights.wasted")}
					stroke={colors.wasted}
					strokeWidth={2}
					dot={{ r: 4, strokeWidth: 2, stroke: colors.surface }}
					activeDot={{ r: 4, strokeWidth: 2, stroke: colors.surface }}
				/>
			</LineChart>
		</ResponsiveContainer>
	);
}
