import * as Dialog from '@kobalte/core/dialog';
import * as DropdownMenu from '@kobalte/core/dropdown-menu';
import * as Popover from '@kobalte/core/popover';
import {
	Cable,
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	Ellipsis,
	Eye,
	EyeOff,
	FilePlusCorner,
	FolderOpen,
	Info,
	Plus,
	Save,
	SlidersHorizontal,
	TimerReset,
	Trash2,
	Video,
	X,
} from 'lucide-solid';
import {
	For,
	Index,
	Show,
	createEffect,
	createMemo,
	createSignal,
	createUniqueId,
	onCleanup,
	untrack,
	type JSX,
} from 'solid-js';
import './App.css';
import { COLOR_NAMES, COLOR_PALETTE, cloneConfig, colorName, createConnection, shaderSignature } from './config';
import { LandmarkCombobox } from './LandmarkCombobox';
import { MEASUREMENT_LABELS, MEASUREMENT_ORDER, defaultInputRange } from './landmarks';
import { MidiRouter, midiOutputs } from './midi';
import { clampMidiValue } from './numbers';
import {
	clearWorkingConfig,
	deleteNamedConfig,
	listNamedConfigs,
	loadNamedConfig,
	loadWorkingConfig,
	persistWorkingConfig,
	saveNamedConfig,
	type NamedConfig,
} from './persistence';
import { createShaderRuntime, type ShaderRuntime } from './shader-runtime';
import type { AppConfig, ConnectionConfig, MeasurementSample } from './types';

interface CalibrationState {
	connectionId: string;
	phase: 'countdown' | 'recording';
	secondsRemaining: number;
	startsAt: number;
	endsAt: number;
	min: number;
	max: number;
}

function CalibrationTime(props: { seconds: number; tenths: boolean }) {
	const display = createMemo(() =>
		props.tenths ? Math.max(0, props.seconds).toFixed(1) : String(Math.ceil(Math.max(0, props.seconds))),
	);
	const whole = createMemo(() => display().split('.')[0]);
	const tenth = createMemo(() => display().split('.')[1]);

	return (
		<strong class="calibration-time">
			<span>{whole()}</span>
			<Show when={tenth()}>{digit => <small class="calibration-tenth">.{digit()}</small>}</Show>
		</strong>
	);
}

function NumberField(props: {
	label: string;
	value: number;
	min?: number;
	max?: number;
	step?: number;
	onChange: (value: number) => void;
}) {
	const inputId = createUniqueId();
	let repeatDelay: number | undefined;
	let repeatTimer: number | undefined;
	const step = () => props.step ?? 1;
	const nudge = (direction: -1 | 1) => {
		let next = props.value + step() * direction;
		if (props.min !== undefined) next = Math.max(props.min, next);
		if (props.max !== undefined) next = Math.min(props.max, next);
		props.onChange(Number(next.toFixed(8)));
	};
	const stopNudging = () => {
		if (repeatDelay) window.clearTimeout(repeatDelay);
		if (repeatTimer) window.clearInterval(repeatTimer);
		repeatDelay = undefined;
		repeatTimer = undefined;
	};
	const startNudging = (event: PointerEvent, direction: -1 | 1) => {
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
		stopNudging();
		nudge(direction);
		repeatDelay = window.setTimeout(() => {
			repeatTimer = window.setInterval(() => nudge(direction), 65);
		}, 340);
	};
	onCleanup(stopNudging);

	return (
		<div class="number-field">
			<label for={inputId}>{props.label}</label>
			<div class="number-input-wrap">
				<input
					id={inputId}
					type="number"
					value={props.value}
					min={props.min}
					max={props.max}
					step={step()}
					onInput={event => {
						const value = event.currentTarget.valueAsNumber;
						if (Number.isFinite(value)) props.onChange(value);
					}}
				/>
				<span class="number-steppers">
					<button
						type="button"
						aria-label={`Increase ${props.label}`}
						onPointerDown={event => startNudging(event, 1)}
						onPointerUp={stopNudging}
						onPointerCancel={stopNudging}
						onClick={event => {
							event.stopPropagation();
							if (event.detail === 0) nudge(1);
						}}
					>
						<ChevronUp size={10} />
					</button>
					<button
						type="button"
						aria-label={`Decrease ${props.label}`}
						onPointerDown={event => startNudging(event, -1)}
						onPointerUp={stopNudging}
						onPointerCancel={stopNudging}
						onClick={event => {
							event.stopPropagation();
							if (event.detail === 0) nudge(-1);
						}}
					>
						<ChevronDown size={10} />
					</button>
				</span>
			</div>
		</div>
	);
}

function KDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	class?: string;
	children: JSX.Element;
}) {
	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay class="dialog-overlay" />
				<div class="dialog-positioner">
					<Dialog.Content class={`dialog-content ${props.class ?? ''}`}>
						<Dialog.Title class="sr-only">{props.title}</Dialog.Title>
						{props.children}
					</Dialog.Content>
				</div>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

interface DeviceSelectOption {
	value: string;
	label: string;
}

interface MenuSelectOption {
	value: string;
	label: string;
}

const MEASUREMENT_OPTIONS: readonly MenuSelectOption[] = MEASUREMENT_ORDER.map(measurement => ({
	value: measurement,
	label: MEASUREMENT_LABELS[measurement],
}));

const PERFORMER_OPTIONS: readonly MenuSelectOption[] = [1, 2, 3, 4].map(count => ({
	value: String(count),
	label: String(count),
}));

function DeviceSelect(props: {
	label: string;
	value: string;
	icon: JSX.Element;
	options: readonly DeviceSelectOption[];
	onChange: (value: string) => void;
}) {
	return (
		<label class="device-select-wrap">
			{props.icon}
			<select aria-label={props.label} onChange={event => props.onChange(event.currentTarget.value)}>
				<For each={props.options}>
					{option => (
						<option value={option.value} selected={option.value === props.value}>
							{option.label}
						</option>
					)}
				</For>
			</select>
			<ChevronDown size={13} />
		</label>
	);
}

function MenuSelect(props: {
	label: string;
	value: string;
	options: readonly MenuSelectOption[];
	class: string;
	contentClass?: string;
	children: JSX.Element;
	onChange: (value: string) => void;
}) {
	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger class={props.class} aria-label={props.label}>
				{props.children}
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content class={`menu-content menu-select-content ${props.contentClass ?? ''}`}>
					<For each={props.options}>
						{option => (
							<DropdownMenu.Item class="menu-item" onSelect={() => props.onChange(option.value)}>
								{option.label}
								<Show when={option.value === props.value}>
									<Check class="menu-select-check" size={14} />
								</Show>
							</DropdownMenu.Item>
						)}
					</For>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

function swatchStyle(color: string): JSX.CSSProperties {
	return color === 'transparent' || color === 'rainbow' ? {} : { background: color };
}

function savedConfigSummary(entry: NamedConfig): string {
	const controls = `${entry.config.connections.length} ${entry.config.connections.length === 1 ? 'control' : 'controls'}`;
	if (!entry.updatedAt) return `${controls} · Earlier save`;
	return `${controls} · ${new Date(entry.updatedAt).toLocaleString()}`;
}

function App() {
	const [config, setConfig] = createSignal<AppConfig>(loadWorkingConfig());
	const [editOpen, setEditOpen] = createSignal(false);
	const [fileMenuOpen, setFileMenuOpen] = createSignal(false);
	const [aboutOpen, setAboutOpen] = createSignal(false);
	const [saveDialogOpen, setSaveDialogOpen] = createSignal(false);
	const [loadDialogOpen, setLoadDialogOpen] = createSignal(false);
	const [saveName, setSaveName] = createSignal('');
	const [savedConfigs, setSavedConfigs] = createSignal<NamedConfig[]>(listNamedConfigs());
	const [cameraStatus, setCameraStatus] = createSignal('Camera off');
	const [cameraError, setCameraError] = createSignal<string | null>(null);
	const [cameraDevices, setCameraDevices] = createSignal<MediaDeviceInfo[]>([]);
	const [cameraDeviceId, setCameraDeviceId] = createSignal('');
	const [videoReady, setVideoReady] = createSignal(false);
	const [engineStatus, setEngineStatus] = createSignal('Waiting for camera');
	const [midiAccess, setMidiAccess] = createSignal<MIDIAccess | null>(null);
	const [outputs, setOutputs] = createSignal<MIDIOutput[]>([]);
	const [midiError, setMidiError] = createSignal<string | null>(null);
	const [samples, setSamples] = createSignal<MeasurementSample[]>([]);
	const [calibration, setCalibration] = createSignal<CalibrationState | null>(null);
	const [toast, setToast] = createSignal<string | null>(null);
	let canvas!: HTMLCanvasElement;
	let video!: HTMLVideoElement;
	let stream: MediaStream | null = null;
	let runtime: ShaderRuntime | null = null;
	let calibrationTimer: number | undefined;
	let toastTimer: number | undefined;
	const midiRouter = new MidiRouter();
	const introComplete = createMemo(() => videoReady() && Boolean(midiAccess()));
	const setupComplete = createMemo(
		() => videoReady() && outputs().some(output => output.id === config().midiOutputId),
	);
	let introHandled = false;

	const showToast = (message: string) => {
		setToast(message);
		if (toastTimer) window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => setToast(null), 2400);
	};

	const updateConfig = (updater: (current: AppConfig) => AppConfig) => {
		setConfig(current => updater(current));
	};

	const updateConnection = (id: string, patch: Partial<ConnectionConfig>) => {
		updateConfig(current => ({
			...current,
			connections: current.connections.map(connection =>
				connection.id === id ? { ...connection, ...patch } : connection,
			),
		}));
	};

	const currentShaderSignature = createMemo(() => shaderSignature(config()));

	const samplesByConnection = createMemo(() => {
		const byConnection = new Map<string, MeasurementSample>();
		for (const sample of samples()) {
			if (!byConnection.has(sample.connectionId)) byConnection.set(sample.connectionId, sample);
		}
		return byConnection;
	});
	const sampleFor = (connectionId: string) => samplesByConnection().get(connectionId);

	const routeSamples = (nextSamples: MeasurementSample[]) => {
		setSamples(nextSamples);
		midiRouter.send(config(), nextSamples);
		const currentCalibration = calibration();
		if (currentCalibration?.phase !== 'recording') return;
		const values = nextSamples
			.filter(sample => sample.connectionId === currentCalibration.connectionId)
			.map(sample => sample.rawValue);
		if (!values.length) return;
		setCalibration(current =>
			current
				? {
						...current,
						min: Math.min(current.min, ...values),
						max: Math.max(current.max, ...values),
					}
				: null,
		);
	};

	const rebuildRuntime = () => {
		runtime?.destroy();
		runtime = null;
		if (!videoReady()) return;
		try {
			setEngineStatus('Building shader');
			runtime = createShaderRuntime({
				canvas,
				video,
				config: untrack(() => cloneConfig(config())),
				getConfig: config,
				onMeasurements: routeSamples,
				onStatus: setEngineStatus,
			});
		} catch (error) {
			setEngineStatus(error instanceof Error ? error.message : 'Shader failed to start');
		}
	};

	createEffect(() => {
		persistWorkingConfig(config());
	});

	createEffect(() => {
		currentShaderSignature();
		if (videoReady()) rebuildRuntime();
	});

	createEffect(() => {
		const output = outputs().find(candidate => candidate.id === config().midiOutputId) ?? null;
		midiRouter.setOutput(output);
	});

	createEffect(() => {
		if (!introComplete() || introHandled) return;
		introHandled = true;
		if (untrack(() => config().connections.length === 0)) setEditOpen(true);
	});

	const refreshCameraDevices = async (activeDeviceId = cameraDeviceId()) => {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		try {
			const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
				device => device.kind === 'videoinput',
			);
			setCameraDevices(devices);
			const selectedDeviceId = devices.some(device => device.deviceId === activeDeviceId)
				? activeDeviceId
				: (devices[0]?.deviceId ?? '');
			setCameraDeviceId(selectedDeviceId);
		} catch {
			// Device enumeration is a convenience after permission; the active stream can continue without it.
		}
	};

	const startCamera = async (deviceId?: string) => {
		setCameraError(null);
		setCameraStatus(deviceId ? 'Switching camera' : 'Requesting camera');
		const previousStream = stream;
		let nextStream: MediaStream | null = null;
		try {
			nextStream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					width: { ideal: 1280 },
					height: { ideal: 720 },
					...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
				},
			});
			video.srcObject = nextStream;
			video.muted = true;
			video.playsInline = true;
			await video.play();
			stream = nextStream;
			previousStream?.getTracks().forEach(track => track.stop());
			const videoTrack = nextStream.getVideoTracks()[0];
			const activeDeviceId = videoTrack?.getSettings().deviceId ?? deviceId ?? '';
			setCameraDeviceId(activeDeviceId);
			await refreshCameraDevices(activeDeviceId);
			videoTrack?.addEventListener(
				'ended',
				() => {
					if (stream !== nextStream) return;
					stream = null;
					setVideoReady(false);
					setCameraStatus('Camera disconnected');
					void refreshCameraDevices();
				},
				{ once: true },
			);
			setCameraStatus('Camera live');
			setVideoReady(true);
		} catch (error) {
			nextStream?.getTracks().forEach(track => track.stop());
			if (previousStream) {
				video.srcObject = previousStream;
				stream = previousStream;
				setCameraStatus('Camera live');
				setVideoReady(true);
			} else {
				setCameraStatus('Camera unavailable');
				setVideoReady(false);
			}
			const message = error instanceof Error ? error.message : 'Camera permission was not granted.';
			setCameraError(message);
		}
	};

	const refreshOutputs = (access: MIDIAccess) => {
		const nextOutputs = midiOutputs(access);
		setOutputs(nextOutputs);
		if (!config().midiOutputId && nextOutputs[0]) {
			updateConfig(current => ({ ...current, midiOutputId: nextOutputs[0].id }));
		}
	};

	const connectMidi = async () => {
		setMidiError(null);
		if (!navigator.requestMIDIAccess) {
			setMidiError('Web MIDI is unavailable in this browser.');
			return;
		}
		try {
			const access = await navigator.requestMIDIAccess({ sysex: false });
			setMidiAccess(access);
			refreshOutputs(access);
			access.onstatechange = () => refreshOutputs(access);
			if (access.outputs.size === 0) setMidiError('No MIDI output devices found.');
		} catch (error) {
			setMidiError(error instanceof Error ? error.message : 'MIDI access was not granted.');
		}
	};

	const addConnection = () => {
		updateConfig(current => ({
			...current,
			connections: [...current.connections, createConnection(current.connections)],
		}));
		setEditOpen(true);
	};

	const duplicateConnection = (connection: ConnectionConfig) => {
		updateConfig(current => {
			const fresh = createConnection(current.connections, connection.measurement);
			return {
				...current,
				connections: [...current.connections, { ...connection, id: fresh.id, cc: fresh.cc }],
			};
		});
	};

	const setMeasurement = (connection: ConnectionConfig, measurement: ConnectionConfig['measurement']) => {
		if (measurement === connection.measurement) return;
		const [inputMin, inputMax] = defaultInputRange(measurement);
		updateConnection(connection.id, {
			measurement,
			inputMin,
			inputMax,
		});
	};

	const finishCalibration = (state: CalibrationState) => {
		if (Number.isFinite(state.min) && Number.isFinite(state.max) && state.max - state.min > 1e-6) {
			updateConnection(state.connectionId, {
				inputMin: state.min,
				inputMax: state.max,
			});
			showToast('Calibration captured');
		} else {
			showToast('No usable movement was detected');
		}
		setCalibration(null);
		if (calibrationTimer) window.clearInterval(calibrationTimer);
		calibrationTimer = undefined;
	};

	const startCalibration = (connectionId: string) => {
		if (calibrationTimer) window.clearInterval(calibrationTimer);
		const startsAt = Date.now() + 3000;
		const endsAt = startsAt + 5000;
		setCalibration({
			connectionId,
			phase: 'countdown',
			secondsRemaining: 3,
			startsAt,
			endsAt,
			min: Infinity,
			max: -Infinity,
		});
		calibrationTimer = window.setInterval(() => {
			const now = Date.now();
			setCalibration(current => {
				if (!current) return null;
				if (now >= current.endsAt) {
					window.queueMicrotask(() => finishCalibration(current));
					return current;
				}
				if (now >= current.startsAt) {
					return {
						...current,
						phase: 'recording',
						secondsRemaining: Math.max(0, (current.endsAt - now) / 1000),
					};
				}
				return {
					...current,
					secondsRemaining: Math.max(0, Math.ceil((current.startsAt - now) / 1000)),
				};
			});
		}, 100);
	};

	const cancelCalibration = () => {
		if (calibrationTimer) window.clearInterval(calibrationTimer);
		calibrationTimer = undefined;
		setCalibration(null);
	};

	const newFile = () => {
		if (
			config().connections.length &&
			!window.confirm('Start a new configuration? Your named configurations will remain available.')
		)
			return;
		cancelCalibration();
		setConfig(clearWorkingConfig());
		setEditOpen(true);
		showToast('New configuration');
	};

	const refreshSavedConfigs = () => {
		const next = listNamedConfigs();
		setSavedConfigs(next);
		return next;
	};

	const saveFile = () => {
		setSaveName('');
		setSaveDialogOpen(true);
	};

	const submitSave = (event: SubmitEvent) => {
		event.preventDefault();
		const name = saveName().trim();
		if (!name) return;
		saveNamedConfig(name, config());
		refreshSavedConfigs();
		setSaveDialogOpen(false);
		showToast(`Saved “${name}” locally`);
	};

	const loadFile = () => {
		const available = refreshSavedConfigs();
		if (!available.length) {
			showToast('No saved configuration yet');
			return;
		}
		setLoadDialogOpen(true);
	};

	const chooseSavedConfig = (entry: NamedConfig) => {
		const saved = loadNamedConfig(entry.name);
		if (!saved) {
			refreshSavedConfigs();
			showToast('That saved configuration is no longer available');
			return;
		}
		cancelCalibration();
		setConfig(saved);
		setEditOpen(saved.connections.length === 0);
		setLoadDialogOpen(false);
		showToast(`Loaded “${entry.name}”`);
	};

	const removeSavedConfig = (entry: NamedConfig) => {
		deleteNamedConfig(entry.name);
		const remaining = refreshSavedConfigs();
		if (!remaining.length) setLoadDialogOpen(false);
		showToast(`Deleted “${entry.name}”`);
	};

	let openEditOnEscapeRelease = false;
	const hasOpenEscapeTarget = () =>
		fileMenuOpen() ||
		Boolean(calibration()) ||
		editOpen() ||
		aboutOpen() ||
		saveDialogOpen() ||
		loadDialogOpen() ||
		Boolean(document.querySelector('[data-expanded]'));

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			openEditOnEscapeRelease = !hasOpenEscapeTarget();
			if (calibration()) {
				event.preventDefault();
				event.stopPropagation();
				cancelCalibration();
			}
			return;
		}
		if (!(event.metaKey || event.ctrlKey)) return;
		const key = event.key.toLowerCase();
		if (key === 's') {
			event.preventDefault();
			saveFile();
		} else if (key === 'o') {
			event.preventDefault();
			loadFile();
		} else if (key === 'n') {
			event.preventDefault();
			newFile();
		}
	};
	const onKeyUp = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		const shouldOpenEdit = openEditOnEscapeRelease;
		openEditOnEscapeRelease = false;
		if (shouldOpenEdit && !hasOpenEscapeTarget()) setEditOpen(true);
	};
	window.addEventListener('keydown', onKeyDown, true);
	window.addEventListener('keyup', onKeyUp, true);
	const handleCameraDeviceChange = () => void refreshCameraDevices();
	navigator.mediaDevices?.addEventListener?.('devicechange', handleCameraDeviceChange);

	onCleanup(() => {
		window.removeEventListener('keydown', onKeyDown, true);
		window.removeEventListener('keyup', onKeyUp, true);
		navigator.mediaDevices?.removeEventListener?.('devicechange', handleCameraDeviceChange);
		runtime?.destroy();
		stream?.getTracks().forEach(track => track.stop());
		if (calibrationTimer) window.clearInterval(calibrationTimer);
		if (toastTimer) window.clearTimeout(toastTimer);
		const access = midiAccess();
		if (access) access.onstatechange = null;
	});

	return (
		<main class="app-shell">
			<nav class="menu-bar" aria-label="Application menu">
				<div class="menu-left">
					<DropdownMenu.Root open={fileMenuOpen()} onOpenChange={setFileMenuOpen}>
						<DropdownMenu.Trigger class="menu-button">File</DropdownMenu.Trigger>
						<DropdownMenu.Portal>
							<DropdownMenu.Content class="menu-content">
								<DropdownMenu.Item class="menu-item" onSelect={newFile}>
									<FilePlusCorner size={15} /> New <kbd>⌘N</kbd>
								</DropdownMenu.Item>
								<DropdownMenu.Item
									class="menu-item"
									disabled={!savedConfigs().length}
									onSelect={loadFile}
								>
									<FolderOpen size={15} /> Load <kbd>⌘O</kbd>
								</DropdownMenu.Item>
								<DropdownMenu.Item class="menu-item" onSelect={saveFile}>
									<Save size={15} /> Save <kbd>⌘S</kbd>
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Portal>
					</DropdownMenu.Root>
					<button class="menu-button" type="button" onClick={() => setEditOpen(true)}>
						Edit
					</button>
					<button class="menu-button" type="button" onClick={() => setAboutOpen(true)}>
						About
					</button>
				</div>
				<div class="menu-status" title={cameraError() ?? midiError() ?? undefined}>
					<Show
						when={videoReady()}
						fallback={
							<button class="status-button" type="button" onClick={() => void startCamera()}>
								<Video size={14} /> Start camera
							</button>
						}
					>
						<DeviceSelect
							label="Camera"
							value={cameraDeviceId()}
							icon={<Video size={14} />}
							options={
								cameraDevices().length
									? cameraDevices().map((device, index) => ({
											value: device.deviceId,
											label: device.label || `Camera ${index + 1}`,
										}))
									: [{ value: cameraDeviceId(), label: 'Active camera' }]
							}
							onChange={deviceId => void startCamera(deviceId)}
						/>
					</Show>
					<Show
						when={midiAccess()}
						fallback={
							<button class="status-button" type="button" onClick={connectMidi}>
								<Cable size={14} /> Enable MIDI
							</button>
						}
					>
						<DeviceSelect
							label="MIDI output"
							value={config().midiOutputId ?? ''}
							icon={<Cable size={14} />}
							options={[
								{ value: '', label: 'No MIDI output' },
								...outputs().map(output => ({ value: output.id, label: output.name ?? output.id })),
							]}
							onChange={midiOutputId =>
								updateConfig(current => ({ ...current, midiOutputId: midiOutputId || null }))
							}
						/>
					</Show>
					<span class="live-status">
						<i classList={{ live: videoReady() }} />
						{videoReady() ? engineStatus() : cameraStatus()}
					</span>
				</div>
			</nav>

			<section class="camera-stage">
				<canvas ref={canvas} aria-label="Camera connections visualization" />
				<video
					ref={video}
					class="source-video"
					classList={{ 'splash-preview': videoReady() && !introComplete() }}
					aria-hidden="true"
				/>
				<Show when={!introComplete()}>
					<div class="camera-empty" classList={{ 'has-camera': videoReady() }}>
						<h1>MIDI from movement</h1>
						<p>Generate MIDI CC messages using your body's motion</p>
						<div class="camera-empty-actions">
							<Show when={!videoReady()}>
								<button class="primary-button" type="button" onClick={() => void startCamera()}>
									<Video size={17} /> Start camera
								</button>
							</Show>
							<Show when={!midiAccess()}>
								<button class="primary-button" type="button" onClick={connectMidi}>
									<Cable size={17} /> Enable MIDI
								</button>
							</Show>
						</div>
						<Show when={cameraError() || midiError()}>
							{message => <small class="error-text">{message()}</small>}
						</Show>
					</div>
				</Show>
			</section>

			<Show when={calibration()}>
				{current => (
					<section
						class={`calibration-screen ${current().phase}`}
						aria-live="polite"
						aria-label="Calibration in progress"
					>
						<div class="calibration-grid" aria-hidden="true" />
						<header class="calibration-screen-header">
							<span>MC / CR—05</span>
							<strong>RANGE CAPTURE</strong>
							<span>{current().phase === 'countdown' ? 'STANDBY' : 'SIGNAL LIVE'}</span>
						</header>
						<div class="calibration-readout">
							<span>{current().phase === 'countdown' ? 'T—MINUS' : 'RECORD'}</span>
							<CalibrationTime
								seconds={current().secondsRemaining}
								tenths={current().phase === 'recording'}
							/>
							<small>{current().phase === 'countdown' ? 'COUNT' : 'SECONDS'}</small>
						</div>
						<div class="calibration-directive">
							<span>FULL RANGE / ALL AXES</span>
							<h2>
								{current().phase === 'countdown'
									? 'Prepare position.'
									: 'Move through the complete range.'}
							</h2>
							<p>
								{current().phase === 'countdown'
									? 'Capture begins automatically.'
									: 'Make the smallest and largest movement you want mapped to MIDI.'}
							</p>
						</div>
						<div class="calibration-data">
							<div>
								<span>MIN</span>
								<strong>{Number.isFinite(current().min) ? current().min.toFixed(3) : '—.—'}</strong>
							</div>
							<div>
								<span>MAX</span>
								<strong>{Number.isFinite(current().max) ? current().max.toFixed(3) : '—.—'}</strong>
							</div>
							<div>
								<span>STATE</span>
								<strong>{current().phase === 'countdown' ? 'ARMED' : 'SAMPLING'}</strong>
							</div>
						</div>
						<div class="calibration-screen-progress">
							<i
								style={{
									width:
										current().phase === 'countdown'
											? `${(1 - current().secondsRemaining / 3) * 100}%`
											: `${(1 - current().secondsRemaining / 5) * 100}%`,
								}}
							/>
						</div>
						<button class="calibration-cancel" type="button" onClick={cancelCalibration}>
							ESC / CANCEL
						</button>
					</section>
				)}
			</Show>

			<KDialog
				open={editOpen() && !calibration()}
				onOpenChange={open => {
					if (!calibration()) setEditOpen(open);
				}}
				title="Configure controls"
				class="config-dialog"
			>
				<header class="config-header">
					<div>
						<span class="eyebrow">EDIT</span>
						<h2>Control connections</h2>
					</div>
					<div class="config-actions">
						<MenuSelect
							label="Performers"
							value={String(config().maxPeople)}
							options={PERFORMER_OPTIONS}
							class="people-control"
							contentClass="performers-menu-content"
							onChange={value =>
								updateConfig(current => ({
									...current,
									maxPeople: Number(value),
								}))
							}
						>
							<span>Performers</span>
							<strong>{config().maxPeople}</strong>
							<ChevronDown size={13} />
						</MenuSelect>
						<button
							class="icon-button"
							type="button"
							onClick={() => setEditOpen(false)}
							aria-label="Close configuration"
						>
							<X size={19} />
						</button>
					</div>
				</header>

				<div class="controls-table-wrap">
					<Show
						when={config().connections.length}
						fallback={
							<div class="empty-controls">
								<SlidersHorizontal size={28} />
								<h3>No connections yet</h3>
								<p>Connect two landmarks to turn their movement into a MIDI CC value.</p>
								<button class="primary-button" type="button" onClick={addConnection}>
									<Plus size={17} /> Add new control
								</button>
							</div>
						}
					>
						<table class="controls-table">
							<thead>
								<tr>
									<th>Point A</th>
									<th>Point B</th>
									<th>Measure</th>
									<th>CC</th>
									<th>Color</th>
									<th>
										<span class="sr-only">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody>
								<Index each={config().connections}>
									{connection => (
										<tr
											classList={{
												disabled: !connection().enabled,
												invalid:
													connection().pointA === connection().pointB &&
													connection().pointA !== null,
											}}
										>
											<td>
												<LandmarkCombobox
													value={connection().pointA}
													label="Point A"
													onChange={pointA => updateConnection(connection().id, { pointA })}
												/>
											</td>
											<td>
												<LandmarkCombobox
													value={connection().pointB}
													label="Point B"
													onChange={pointB => updateConnection(connection().id, { pointB })}
												/>
											</td>
											<td>
												<MenuSelect
													label="Measurement type"
													value={connection().measurement}
													options={MEASUREMENT_OPTIONS}
													class="measure-select-wrap"
													contentClass="measurement-menu-content"
													onChange={value => {
														const measurement = MEASUREMENT_ORDER.find(
															candidate => candidate === value,
														);
														if (measurement) setMeasurement(connection(), measurement);
													}}
												>
													<span class="measure-select-value">
														<strong>{MEASUREMENT_LABELS[connection().measurement]}</strong>
														<ChevronDown size={13} />
													</span>
													<small>
														{sampleFor(connection().id)?.rawValue.toFixed(
															connection().measurement === 'angle' ? 1 : 3,
														) ?? '—'}
														{connection().measurement === 'angle' ? '°' : ''}
													</small>
												</MenuSelect>
											</td>
											<td>
												<Popover.Root placement="bottom-end">
													<Popover.Trigger class="cc-button">
														{connection().cc}
														<small>
															{connection().midiMin}–{connection().midiMax}
														</small>
													</Popover.Trigger>
													<Popover.Portal>
														<Popover.Content class="popover-content cc-popover">
															<Popover.Title>MIDI mapping</Popover.Title>
															<div class="field-grid">
																<NumberField
																	label="CC"
																	value={connection().cc}
																	min={0}
																	max={127}
																	onChange={cc =>
																		updateConnection(connection().id, {
																			cc: clampMidiValue(cc),
																		})
																	}
																/>
																<NumberField
																	label="Min"
																	value={connection().midiMin}
																	min={0}
																	max={127}
																	onChange={midiMin =>
																		updateConnection(connection().id, {
																			midiMin: clampMidiValue(midiMin),
																		})
																	}
																/>
																<NumberField
																	label="Max"
																	value={connection().midiMax}
																	min={0}
																	max={127}
																	onChange={midiMax =>
																		updateConnection(connection().id, {
																			midiMax: clampMidiValue(midiMax),
																		})
																	}
																/>
															</div>
															<div class="input-range">
																<NumberField
																	label="Input min"
																	value={connection().inputMin}
																	step={0.001}
																	onChange={inputMin =>
																		updateConnection(connection().id, {
																			inputMin,
																		})
																	}
																/>
																<NumberField
																	label="Input max"
																	value={connection().inputMax}
																	step={0.001}
																	onChange={inputMax =>
																		updateConnection(connection().id, {
																			inputMax,
																		})
																	}
																/>
															</div>
															<button
																class="calibrate-button"
																type="button"
																disabled={!connection().pointA || !connection().pointB}
																onClick={() => startCalibration(connection().id)}
															>
																<TimerReset size={15} /> Calibrate over 5 seconds
															</button>
														</Popover.Content>
													</Popover.Portal>
												</Popover.Root>
											</td>
											<td>
												<Popover.Root placement="bottom-end">
													<Popover.Trigger
														class="color-button"
														aria-label={`Connection color ${colorName(connection().color)}`}
													>
														<i
															classList={{
																transparent: connection().color === 'transparent',
																rainbow: connection().color === 'rainbow',
															}}
															style={swatchStyle(connection().color)}
														/>
													</Popover.Trigger>
													<Popover.Portal>
														<Popover.Content class="popover-content color-popover">
															<Popover.Title>Connection color</Popover.Title>
															<div class="color-grid">
																<For each={[...COLOR_PALETTE]}>
																	{color => (
																		<button
																			type="button"
																			classList={{
																				selected: color === connection().color,
																				transparent: color === 'transparent',
																				rainbow: color === 'rainbow',
																			}}
																			style={swatchStyle(color)}
																			onClick={() =>
																				updateConnection(connection().id, {
																					color,
																				})
																			}
																			aria-label={COLOR_NAMES[color]}
																			title={COLOR_NAMES[color]}
																		>
																			<Show when={color === connection().color}>
																				<Check size={14} />
																			</Show>
																		</button>
																	)}
																</For>
															</div>
														</Popover.Content>
													</Popover.Portal>
												</Popover.Root>
											</td>
											<td>
												<DropdownMenu.Root>
													<DropdownMenu.Trigger
														class="row-menu-button"
														aria-label="Connection actions"
													>
														<Ellipsis size={18} />
													</DropdownMenu.Trigger>
													<DropdownMenu.Portal>
														<DropdownMenu.Content class="menu-content row-menu-content">
															<DropdownMenu.Item
																class="menu-item"
																disabled={!connection().pointA || !connection().pointB}
																onSelect={() => startCalibration(connection().id)}
															>
																<TimerReset size={15} /> Calibrate
															</DropdownMenu.Item>
															<DropdownMenu.Item
																class="menu-item"
																onSelect={() => duplicateConnection(connection())}
															>
																<Copy size={15} /> Duplicate
															</DropdownMenu.Item>
															<DropdownMenu.Item
																class="menu-item"
																onSelect={() =>
																	updateConnection(connection().id, {
																		enabled: !connection().enabled,
																	})
																}
															>
																{connection().enabled ? (
																	<EyeOff size={15} />
																) : (
																	<Eye size={15} />
																)}{' '}
																{connection().enabled ? 'Disable' : 'Enable'}
															</DropdownMenu.Item>
															<DropdownMenu.Separator class="menu-separator" />
															<DropdownMenu.Item
																class="menu-item danger"
																onSelect={() =>
																	updateConfig(current => ({
																		...current,
																		connections: current.connections.filter(
																			item => item.id !== connection().id,
																		),
																	}))
																}
															>
																<Trash2 size={15} /> Delete
															</DropdownMenu.Item>
														</DropdownMenu.Content>
													</DropdownMenu.Portal>
												</DropdownMenu.Root>
											</td>
										</tr>
									)}
								</Index>
							</tbody>
						</table>
						<button class="add-control-button" type="button" onClick={addConnection}>
							<Plus size={16} /> Add new control
						</button>
					</Show>
				</div>
				<footer class="config-footer">
					<span>
						<i /> Changes are stored locally
					</span>
					<div>
						<button type="button" onClick={newFile}>
							New
						</button>
						<button type="button" disabled={!savedConfigs().length} onClick={loadFile}>
							Load
						</button>
						<button type="button" onClick={saveFile}>
							Save
						</button>
						<button type="button" class="okay-button" onClick={() => setEditOpen(false)}>
							Okay
						</button>
					</div>
				</footer>
			</KDialog>

			<KDialog
				open={saveDialogOpen()}
				onOpenChange={setSaveDialogOpen}
				title="Save configuration"
				class="file-dialog"
			>
				<button
					class="dialog-close"
					type="button"
					onClick={() => setSaveDialogOpen(false)}
					aria-label="Close save dialog"
				>
					<X size={18} />
				</button>
				<Save size={23} />
				<h2>Save configuration</h2>
				<p>Name this snapshot. Your unnamed current configuration will keep auto-saving as you edit.</p>
				<form class="save-config-form" onSubmit={submitSave}>
					<label for="save-config-name">Name</label>
					<input
						id="save-config-name"
						type="text"
						value={saveName()}
						onInput={event => setSaveName(event.currentTarget.value)}
						placeholder="Performance setup"
						autocomplete="off"
						autofocus
					/>
					<div class="file-dialog-actions">
						<button type="button" onClick={() => setSaveDialogOpen(false)}>
							Cancel
						</button>
						<button class="save-button" type="submit" disabled={!saveName().trim()}>
							Save
						</button>
					</div>
				</form>
			</KDialog>

			<KDialog
				open={loadDialogOpen()}
				onOpenChange={setLoadDialogOpen}
				title="Load configuration"
				class="file-dialog load-dialog"
			>
				<button
					class="dialog-close"
					type="button"
					onClick={() => setLoadDialogOpen(false)}
					aria-label="Close load dialog"
				>
					<X size={18} />
				</button>
				<FolderOpen size={23} />
				<h2>Load configuration</h2>
				<p>Choose a named snapshot. Loading it also makes it the auto-saved current configuration.</p>
				<div class="saved-config-list">
					<For each={savedConfigs()}>
						{entry => (
							<div class="saved-config-item">
								<button
									class="saved-config-main"
									type="button"
									onClick={() => chooseSavedConfig(entry)}
								>
									<strong>{entry.name}</strong>
									<span>{savedConfigSummary(entry)}</span>
								</button>
								<button
									class="saved-config-delete"
									type="button"
									onClick={() => removeSavedConfig(entry)}
									aria-label={`Delete ${entry.name}`}
								>
									<Trash2 size={15} />
								</button>
							</div>
						)}
					</For>
				</div>
				<div class="file-dialog-actions">
					<button type="button" onClick={() => setLoadDialogOpen(false)}>
						Cancel
					</button>
				</div>
			</KDialog>

			<KDialog open={aboutOpen()} onOpenChange={setAboutOpen} title="About MIDI Cam" class="info-dialog">
				<button class="dialog-close" type="button" onClick={() => setAboutOpen(false)}>
					<X size={18} />
				</button>
				<Info size={24} />
				<h2>MIDI Cam</h2>
				<p>
					A camera-driven MIDI controller powered by{' '}
					<a href="https://misery.co/shaderpad" target="_blank" rel="noopener noreferrer">
						ShaderPad
					</a>
					. Each tracked performer is routed to their own ascending MIDI channel.
				</p>
				<section class="about-quick-start">
					<h3>Quick start</h3>
					<ol>
						<li classList={{ complete: setupComplete() }}>
							<span>Enable the camera and MIDI output.</span>
							<Show when={setupComplete()}>
								<strong class="setup-complete">
									<Check size={13} /> Complete
								</strong>
							</Show>
						</li>
						<li>Open Edit and connect two landmarks.</li>
						<li>Choose a measurement type and configure CC settings.</li>
						<li>Calibrate, then move through the full range.</li>
					</ol>
				</section>
				<footer class="about-footer">
					<p>Camera frames and landmark data stay in your browser.</p>
					<p class="about-credit">
						Built by{' '}
						<a href="https://misery.co" target="_blank" rel="noopener noreferrer">
							Misery &amp; Company
						</a>
					</p>
				</footer>
			</KDialog>

			<Show when={toast()}>
				<div class="toast">{toast()}</div>
			</Show>
		</main>
	);
}

export default App;
