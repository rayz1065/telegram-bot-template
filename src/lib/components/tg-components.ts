import { Context } from 'grammy';
import { InlineKeyboardButton } from 'grammy/types';
import {
  MaybeCallable,
  MaybeCalled,
  MaybePromise,
  maybeCall,
} from './maybe-callable';
import { stringifyHash } from './stringify-hash';

type Other<C extends Context> = Parameters<C['api']['sendMessage']>[2];

export type GetPropsType<T extends TgComponent<any, any, any>> =
  T extends TgComponent<any, infer P, any> ? P : never;
export type GetStateType<T extends TgComponent<any, any, any>> =
  T extends TgComponent<infer S, any, any> ? S : never;

export type MaybeLazyProperty<T, Props, State> = MaybeCallable<
  T,
  [Props, State]
>;

export interface TgMessage<C extends Context = Context> {
  text: string;
  keyboard?: InlineKeyboardButton[][];
  other?: Omit<Other<C>, 'reply_markup'>;
}

type TgStateBase = Record<string, any> | null;

export type TgButtonGetter<T extends any[] = any[]> = (
  text: string,
  permanentId: string,
  ...args: T
) => InlineKeyboardButton;
export type TgStateGetter<State extends TgStateBase = TgStateBase> =
  () => State | null;
export type TgStateSetter<State extends TgStateBase = TgStateBase> = (
  state: State
) => void;

export type TgStateProps<State extends TgStateBase> = {
  getState: TgStateGetter<State>;
  setState: TgStateSetter<State>;
};

export type TgDefaultProps<State extends TgStateBase> = {
  getButton: TgButtonGetter;
} & TgStateProps<State>;

type HandlerFunction<T extends any[] = any[]> = (
  ...args: T
) => MaybePromise<void>;
type HandlerData<T extends any[] = any[]> = {
  permanentId: string;
  handler: HandlerFunction<T>;
};

type TgPropsBase<State extends TgStateBase> = Record<string, any> &
  TgDefaultProps<State>;

/**
 * A TgComponent is a reactive stateful component within telegram.
 * The component takes as input a set of props, the most important ones are
 * - getState, setState, related to state management
 * - getButton, a function that returns a button, when the button is called
 *   the parent component is tasked to call the respective handler
 */
export abstract class TgComponent<
  State extends TgStateBase = null,
  Props extends TgPropsBase<State> = TgPropsBase<State>,
  C extends Context = Context,
> {
  public handlers: { [key: string]: HandlerData } = {};
  protected children: Record<string, TgComponent<any, any, C>> = {};

  /**
   * Cache for lazily-loaded props.
   */
  private propsCache: Partial<{
    [K in keyof Props]: MaybeCalled<Props[K]>;
  }> = {};

  /**
   * The state for which the props cache is valid (JSON encoded).
   * If the state changes, the props have to be recomputed.
   */
  private propsCacheState = '';

  constructor(public props: Props) {}

  public abstract render(): MaybePromise<TgMessage<C>>;

  public abstract getDefaultState(): State;

  protected getChildrenDefaultState() {
    return Object.fromEntries(
      Object.entries(this.children)
        .map(([key, child]) => [key, child.getDefaultState()])
        .filter(([, state]) => state !== null)
    );
  }

  /**
   * Returns the current state of the component, including the values specified
   * by the getDefaultState function.
   *
   * Important: only access the state through this function when the components
   * are fully constructed or the state might be malformed, if necessary use
   * this.props.getState() instead
   */
  public getState(): State {
    return { ...this.getDefaultState(), ...this.props.getState() };
  }

  /**
   * Alias for this.props.setState(state)
   */
  public setState(state: State) {
    this.props.setState(state);
  }

  /**
   * Helper function to partially update the state.
   */
  public patchState(state: State extends null ? never : Partial<State>) {
    this.setState({
      ...this.getState(),
      ...state,
    });
  }

  /**
   * Finds the handler indicated by the permanentId, returns null on failure.
   */
  public findHandler(permanentId: string) {
    for (const key in this.handlers) {
      if (this.handlers[key].permanentId === permanentId) {
        return this.handlers[key];
      }
    }

    return null;
  }

  /**
   * Returns a button with the specified text for the handler.
   * When the button is pressed, the handler will be invoked.
   */
  public getButton<T extends any[]>(
    text: string,
    permanentId: string | HandlerData<T>,
    ...args: T
  ) {
    permanentId =
      typeof permanentId === 'string' ? permanentId : permanentId.permanentId;

    return this.props.getButton(text, permanentId, ...args);
  }

  /**
   * Register a new handler that can be used for routing calls.
   * The permanentId is used in routing, it should be 1 or 2 characters and
   * must be unique. The permanentId cannot be changed after deploying the
   * component to avoid breaking stale UIs.
   *
   * **IMPORTANT**: make sure the handler is properly bound to the right object
   * if it needs to access `this`.
   */
  public registerHandler(permanentId: string, handler: HandlerFunction) {
    const handlerKey = `.${permanentId}`;

    if (handlerKey in this.handlers) {
      throw Error(`Trying to handler key ${handlerKey} already exists`);
    }
    if (this.findHandler(permanentId)) {
      throw Error(`Trying to register handler ${permanentId} already exists`);
    }

    this.handlers[handlerKey] = { permanentId, handler };
  }

  /**
   * Overrides an existing handler with a new one.
   *
   * **IMPORTANT**: make sure the handler is properly bound to the right object
   * if it needs to access `this` (or use an arrow function to capture the
   * local `this`).
   */
  public overrideHandler<T extends any[] = any[]>(
    permanentId: string | HandlerData<T>,
    newHandler: HandlerFunction<T>
  ) {
    permanentId =
      typeof permanentId === 'string' ? permanentId : permanentId.permanentId;

    const handler = this.findHandler(permanentId);
    if (!handler) {
      throw Error(`Trying to override ${permanentId} but it does not exist`);
    }

    (handler as HandlerData<T>).handler = newHandler;
  }

  /**
   * Calls a handler after ensuring it exists.
   * Note that the actual handler called may not be the one you passed, in case
   * it has been overridden.
   */
  public async handle<T extends any[] = any[]>(
    permanentId: string | HandlerData<T>,
    ...args: T
  ) {
    permanentId =
      typeof permanentId === 'string' ? permanentId : permanentId.permanentId;

    const handler = this.findHandler(permanentId);
    if (!handler) {
      throw Error(`Handler ${permanentId} not found`);
    }

    await handler.handler(...args);
  }

  public hasHandler(permanentId: string) {
    return this.findHandler(permanentId) !== null;
  }

  /**
   * Adds a child to the current component, this will in turn create a tree of
   * components where the key is used for routing within the tree.
   * Since telegram callback queries have a very short limit, ensure that the
   * key is as short as possible, possibly a single character.
   */
  public addChild<T extends TgComponent<any, any, C>>(
    key: string,
    child: T
  ): T {
    if (key.indexOf('.') !== -1) {
      throw Error(`Child key ${key} cannot contain dots`);
    }

    this.children[key] = child;

    const childHandlers = child.handlers;
    for (const handlerKey in childHandlers) {
      const childPermanentId = childHandlers[handlerKey].permanentId;
      const newHandlerKey = `${key}.${childPermanentId}`;

      this.registerHandler(newHandlerKey, async (...args: any[]) => {
        await this.children[key].handle(childPermanentId, ...args);
      });
    }

    return child;
  }

  /**
   * Constructs a child component and adds it to the tree.
   * This utility function already handles getting and setting the state by
   * allocating the given key on the state object to the child.
   * It also handles routing clicks, as the getButton function will be updated
   * with the required routing information.
   */
  public makeChild<
    Key extends keyof State & string,
    PropsArg extends TgPropsBase<State extends null ? null : State[Key]>,
    T extends TgComponent<State extends null ? null : State[Key], PropsArg, C>,
  >(
    key: Key,
    ctor: new (props: PropsArg) => T,
    props: Pick<PropsArg, Exclude<keyof PropsArg, keyof TgDefaultProps<any>>>
    // note: adding the following breaks the typing inference in unexpected ways
    // & Partial<TgDefaultProps<State[Key]>>
  ): T {
    return this.addChild(
      key,
      new ctor({
        ...this.getDefaultProps(key),
        ...props,
      } as PropsArg)
    );
  }

  /**
   * Creates all the default props for the given key.
   * This can be used in cases makeChild does not cover.
   */
  public getDefaultProps<Key extends keyof State & string>(
    key: Key
  ): TgDefaultProps<State extends null ? null : State[Key]> {
    return {
      ...this.getButtonProps(key),
      ...this.getStateProps(key),
    };
  }

  /**
   * Creates just the default props relating to the button for the given key.
   * This can be used in cases makeChild does not cover.
   * It also does not require the key to be a valid key of the state.
   */
  public getButtonProps(key: string): { getButton: TgButtonGetter } {
    return {
      getButton: (text, handler, ...args) =>
        this.props.getButton(text, `${key}.${handler}`, ...args),
    };
  }

  /**
   * Creates just the default props relating to state for the given key.
   * This can be used in cases makeChild does not cover.
   */
  public getStateProps<Key extends keyof State & string>(
    key: Key
  ): TgStateProps<State extends null ? null : State[Key]> {
    return {
      getState: () => {
        const state = this.getState();
        return state === null ? null : state[key];
      },
      setState: (state) => {
        // using patchState here leads to an error
        this.setState({
          ...this.getState(),
          [key]: state,
        });
      },
    };
  }

  /**
   * Get the value of a lazy loaded property, the value is also cached
   */
  public async getProperty<K extends keyof Props & string>(
    key: K
  ): Promise<MaybeCalled<Props[K]>> {
    const stateStr = stringifyHash(this.getState());
    if (this.propsCacheState !== stateStr) {
      this.propsCacheState = stateStr;
      this.propsCache = {};
    }

    const cached = this.propsCache[key];
    if (cached) {
      return cached;
    }

    const prop = await maybeCall(this.props[key], this.props, this.getState());
    this.propsCache[key] = prop;
    return prop;
  }
}
