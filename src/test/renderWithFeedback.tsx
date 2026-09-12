import { render } from "@testing-library/react";
import { message } from "antd";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { setFeedbackApis } from "../lib/feedback";

// lib/feedback.ts's `message`/`notification` proxies stay silent until
// something (normally Root.tsx) calls setFeedbackApis — a component rendered
// in isolation, as tests do, never gets that wiring otherwise, so a
// message.error/success call would be invisible in the DOM. This wires up a
// real antd message instance for tests that need to assert on toast content;
// `notification` is stubbed since none of these components call it.
function FeedbackHarness({ children }: { children: ReactElement }) {
	const [messageApi, messageContextHolder] = message.useMessage();
	useEffect(() => {
		setFeedbackApis({ message: messageApi, notification: { info: () => {} } });
	}, [messageApi]);

	return (
		<>
			{messageContextHolder}
			{children}
		</>
	);
}

export function renderWithFeedback(ui: ReactElement) {
	return render(<FeedbackHarness>{ui}</FeedbackHarness>);
}
