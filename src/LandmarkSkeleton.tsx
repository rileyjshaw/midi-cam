import * as Tabs from '@kobalte/core/tabs';
import { Settings, X } from 'lucide-solid';
import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { BODY_TRACKING_OPTIONS, bodyTrackingOption } from './body-tracking';
import { LANDMARK_BY_ID } from './landmarks';
import { LANDMARK_DIAGRAMS, landmarkView } from './landmark-diagrams';
import type { DiagramPoint, LandmarkView } from './landmark-diagrams';
import './LandmarkSkeleton.css';

interface LandmarkSkeletonProps {
	id: string;
	value: string | null;
	activeId: string | undefined;
	onPreview: (id: string | null) => void;
	onSelect: (id: string) => void;
	onNavigate: () => void;
	bodyTracked: ReadonlySet<string>;
	onBodyTrackingChange: (id: string, enabled: boolean) => void;
}

export function LandmarkSkeleton(props: LandmarkSkeletonProps) {
	const [view, setView] = createSignal<LandmarkView>(landmarkView(props.value));
	const [hovered, setHovered] = createSignal<DiagramPoint | null>(null);
	const [tabStop, setTabStop] = createSignal(props.value ?? '');
	const [settingsOpen, setSettingsOpen] = createSignal(false);
	let settingsButton: HTMLButtonElement | undefined;
	const diagram = createMemo(() => LANDMARK_DIAGRAMS[view()]);
	const trackingOptions = createMemo(() => BODY_TRACKING_OPTIONS.filter(option => option.view === view()));
	const points = createMemo(() => {
		const mapped = diagram().points.map(point => {
			const option = trackingOptions().find(option => option.detailedId === point.id);
			return option && props.bodyTracked.has(option.poseId) ? { ...point, id: option.poseId } : point;
		});
		return mapped.map(point => (view() === 'right-hand' ? { ...point, x: 240 - point.x } : point));
	});
	const label = (point: DiagramPoint) => point.label ?? LANDMARK_BY_ID.get(point.id)!.label;
	const syncTracking = (id: string | null | undefined) => {
		const option = bodyTrackingOption(id);
		if (option) props.onBodyTrackingChange(option.poseId, id === option.poseId);
	};
	let diagramElement: HTMLDivElement | undefined;
	let bodyTab: HTMLButtonElement | undefined;

	createEffect(
		on(
			() => props.activeId,
			id => {
				if (id && LANDMARK_BY_ID.has(id)) {
					setSettingsOpen(false);
					syncTracking(id);
					setView(landmarkView(id));
					setTabStop(id);
				}
			},
			{ defer: true },
		),
	);
	createEffect(
		on(
			() => props.value,
			(value, previous) => {
				syncTracking(value);
				if (previous !== undefined) changeView(landmarkView(value));
			},
		),
	);

	const preview = (point: DiagramPoint | null) => {
		setHovered(point);
		props.onPreview(point?.id ?? null);
	};
	const changeView = (next: LandmarkView) => {
		setSettingsOpen(false);
		preview(null);
		props.onNavigate();
		setView(next);
		setTabStop('');
	};
	const isActive = (point: DiagramPoint, id: string | null | undefined): boolean =>
		point.id === id || (!!point.view && !!id && point.view === landmarkView(id));
	const activeLabel = () => {
		const point = hovered();
		if (point) return `${label(point)}${point.view ? ' · explore' : ''}`;
		return LANDMARK_BY_ID.get(props.activeId ?? props.value ?? '')?.label ?? 'Choose a point';
	};
	const activate = (point: DiagramPoint) => {
		if (point.view) {
			changeView(point.view);
			bodyTab?.focus();
		} else props.onSelect(point.id);
	};
	const focusPoint = (id: string) => {
		setTabStop(id);
		diagramElement?.querySelector<HTMLButtonElement>(`[data-point-id="${id}"]`)?.focus();
	};

	return (
		<Tabs.Root
			as="section"
			id={props.id}
			class="landmark-skeleton"
			aria-label="Visual landmark picker"
			onKeyDown={event => {
				if (event.key === 'Escape' && settingsOpen()) {
					event.preventDefault();
					event.stopPropagation();
					setSettingsOpen(false);
					settingsButton?.focus();
				}
			}}
			value={view() === 'screen' ? 'screen' : 'body'}
			onChange={value => changeView(value === 'screen' ? 'screen' : 'body')}
		>
			<Tabs.List class="landmark-skeleton-tabs" aria-label="Landmark diagram">
				<Tabs.Trigger
					value="body"
					ref={bodyTab}
					onClick={() => {
						if (view() !== 'body') changeView('body');
					}}
				>
					Body
				</Tabs.Trigger>
				<Tabs.Trigger value="screen">Screen</Tabs.Trigger>
			</Tabs.List>
			<For each={['body', 'screen']}>
				{tab => (
					<Tabs.Content value={tab} class="landmark-skeleton-panel">
						<Show when={view() !== 'body' && view() !== 'screen'}>
							<div class="landmark-skeleton-detail">
								<span>{diagram().label}</span>
								<button
									ref={settingsButton}
									type="button"
									class="landmark-settings-trigger"
									aria-label={`${diagram().label} settings`}
									title={settingsOpen() ? 'Back to landmarks' : 'Settings'}
									aria-expanded={settingsOpen()}
									aria-controls={settingsOpen() ? `${props.id}-settings` : undefined}
									onClick={() => {
										preview(null);
										props.onNavigate();
										setSettingsOpen(open => !open);
									}}
								>
									<Show when={settingsOpen()} fallback={<Settings size={14} aria-hidden="true" />}>
										<X size={14} aria-hidden="true" />
									</Show>
								</button>
							</div>
						</Show>
						<div class="landmark-skeleton-canvas">
							<Show
								when={settingsOpen()}
								fallback={
									<div
										class="landmark-diagram"
										ref={diagramElement}
										role="group"
										aria-label={`${diagram().label} landmarks`}
										onKeyDown={event => {
											const current = points().find(
												point => point.id === (event.target as HTMLElement).dataset.pointId,
											);
											if (!current) return;
											const direction = {
												ArrowLeft: [-1, 0],
												ArrowRight: [1, 0],
												ArrowUp: [0, -1],
												ArrowDown: [0, 1],
											}[event.key];
											if (!direction) return;
											event.preventDefault();
											event.stopPropagation();
											const [dx, dy] = direction;
											const candidates = points().filter(
												point => (point.x - current.x) * dx + (point.y - current.y) * dy > 0,
											);
											const score = (point: DiagramPoint) =>
												Math.hypot(point.x - current.x, point.y - current.y) +
												Math.abs((point.x - current.x) * dy - (point.y - current.y) * dx);
											candidates.sort((a, b) => score(a) - score(b));
											if (candidates[0]) focusPoint(candidates[0].id);
										}}
									>
										<svg viewBox="0 0 240 320" fill="none" aria-hidden="true">
											<g
												class="landmark-bones"
												transform={
													view() === 'right-hand' ? 'translate(240 0) scale(-1 1)' : undefined
												}
											>
												<For each={diagram().paths}>{path => <path d={path} />}</For>
											</g>
											<Show when={view() === 'body' || view() === 'face'}>
												<text x="18" y="310" class="landmark-side">
													R
												</text>
												<text x="216" y="310" class="landmark-side">
													L
												</text>
											</Show>
										</svg>
										<For each={points()}>
											{point => (
												<button
													type="button"
													class="landmark-point"
													data-point-id={point.id}
													classList={{
														'is-region': !!point.view,
														'is-active':
															hovered()?.id === point.id ||
															(!hovered() && isActive(point, props.activeId)),
														'is-selected': isActive(point, props.value),
													}}
													style={{ left: `${point.x / 2.4}%`, top: `${point.y / 3.2}%` }}
													tabIndex={
														point.id ===
														(points().some(point => point.id === tabStop())
															? tabStop()
															: points()[0].id)
															? 0
															: -1
													}
													aria-label={
														point.view
															? `Explore ${label(point).toLowerCase()}`
															: label(point)
													}
													aria-pressed={point.view ? undefined : props.value === point.id}
													title={
														point.view
															? `Explore ${label(point).toLowerCase()}`
															: label(point)
													}
													onPointerEnter={() => preview(point)}
													onPointerLeave={() => preview(null)}
													onFocus={() => {
														setTabStop(point.id);
														preview(point);
													}}
													onBlur={() => preview(null)}
													onClick={() => activate(point)}
												>
													<span aria-hidden="true">{point.view ? '+' : ''}</span>
												</button>
											)}
										</For>
									</div>
								}
							>
								<div
									id={`${props.id}-settings`}
									class="landmark-settings"
									role="group"
									aria-label={`${diagram().label} settings`}
								>
									<p class="landmark-settings-help">
										The default model is great for detailed close-ups. If the subject’s entire body
										is in frame, the body model may perform better.
									</p>
									<For each={trackingOptions()}>
										{option => (
											<label class="landmark-tracking-option">
												<span>
													{option.label}
													<small>
														{props.bodyTracked.has(option.poseId)
															? 'Body'
															: view() === 'face'
																? 'Face'
																: 'Hand'}
													</small>
												</span>
												<input
													type="checkbox"
													role="switch"
													aria-label={`Use body tracking for ${option.label.toLowerCase()}`}
													checked={props.bodyTracked.has(option.poseId)}
													onChange={event =>
														props.onBodyTrackingChange(
															option.poseId,
															event.currentTarget.checked,
														)
													}
												/>
											</label>
										)}
									</For>
								</div>
							</Show>
						</div>
						<Show when={!settingsOpen()}>
							<div class="landmark-skeleton-caption">
								<strong>{activeLabel()}</strong>
								<span>{view() === 'body' ? '+ Explore face or hands' : 'Select a landmark'}</span>
								<span>Arrow keys to move · Esc to return</span>
							</div>
						</Show>
					</Tabs.Content>
				)}
			</For>
		</Tabs.Root>
	);
}
