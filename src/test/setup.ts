import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; antd's responsive grid observer (used
// internally by Modal, among others) subscribes to it on mount.
if (!window.matchMedia) {
	window.matchMedia = (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	});
}

// jsdom doesn't implement ResizeObserver; antd's Select (and other
// components) subscribe to it on mount via @rc-component/resize-observer.
if (!window.ResizeObserver) {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
