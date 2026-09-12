import type { ReactNode } from "react";

interface MessageApi {
	error: (content: string) => void;
	success: (content: string) => void;
}

interface NotificationArgs {
	key?: string;
	message: ReactNode;
	description?: ReactNode;
	duration?: number;
	btn?: ReactNode;
}

interface NotificationApi {
	info: (args: NotificationArgs) => void;
}

let currentMessageApi: MessageApi | null = null;
let currentNotificationApi: NotificationApi | null = null;

export function setFeedbackApis(apis: {
	message: MessageApi;
	notification: NotificationApi;
}): void {
	currentMessageApi = apis.message;
	currentNotificationApi = apis.notification;
}

// Theme-aware stand-ins for antd's static `message`/`notification` — those
// static methods render outside <ConfigProvider>'s tree and so never pick up
// its dark/light theme.algorithm. Root.tsx wires these to the hook-based
// instances (whose contextHolder is mounted inside ConfigProvider) via
// setFeedbackApis. Call sites elsewhere use these exactly like the antd
// static API; before Root mounts (e.g. a component rendered in isolation in
// a test) they're harmless no-ops rather than throwing.
export const message: MessageApi = {
	error: (content) => currentMessageApi?.error(content),
	success: (content) => currentMessageApi?.success(content),
};

export const notification: NotificationApi = {
	info: (args) => currentNotificationApi?.info(args),
};
