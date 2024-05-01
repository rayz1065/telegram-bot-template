import { InlineKeyboardButton } from 'grammy/types';
import {
  MaybeLazyProperty,
  TgComponent,
  TgDefaultProps,
} from './tg-components';
import { Context } from 'grammy';
import { MaybePromise } from './maybe-callable';

interface State {
  value: number;
}

interface OptionalProps {
  inlineLabelPosition: MaybeLazyProperty<
    'left' | 'center' | 'right' | 'none',
    Props,
    State
  >;
  inlineLabelPrinter: (props: Props, state: State) => MaybePromise<string>;
  textPrinter: (props: Props, state: State) => MaybePromise<string>;
  ctx: null | Context;
  options: MaybeLazyProperty<{ delta: number; label: string }[], Props, State>;

  onInlineLabelClick:
    | null
    | ((props: Props, state: State) => MaybePromise<void>);
}
type RequiredProps = TgDefaultProps<State> & {
  label: string;
};

type Props = RequiredProps & OptionalProps;

export const tgCounterDefaultProps = {
  inlineLabelPosition: 'center',
  textPrinter: (props, state) => `${props.label}: <b>${state.value}</>\n`,
  inlineLabelPrinter: (props, state) => `${props.label}: ${state.value}`,
  ctx: null,
  options: [
    { delta: 1, label: '➖' },
    { delta: -1, label: '➕' },
  ],
  onInlineLabelClick: null,
} as const satisfies OptionalProps;

/**
 * A simple counter component, you can pass in custom options and pick the
 * position of the label (or if you prefer to remove the label).
 * When the label is clicked the text of the label is displayed, if you prefer
 * to change this behavior you can over pass an onInlineLabelClick handler.
 * Example:
 *
 * ```ts
 * this.counter = this.makeChild('c', TgCounter, {
 *   label: 'counter',
 *   inlineLabelPosition: 'left',
 *   onInlineLabelClick: (props) => {
 *     props.setState({ value: 0 });
 *   },
 * });
 * ```
 */
export class TgCounter extends TgComponent<State, Props> {
  protected handlers = {
    a: this.add.bind(this),
    n: this.noop.bind(this),
  };

  public constructor(props: Partial<OptionalProps> & RequiredProps) {
    super({ ...tgCounterDefaultProps, ...props });
  }

  public getDefaultState(): State {
    return { value: 0 };
  }

  public add(delta: number) {
    const state = this.getState();
    this.setState({
      ...state,
      value: state.value + delta,
    });
  }

  public async noop() {
    if (this.props.onInlineLabelClick) {
      return await this.props.onInlineLabelClick(this.props, this.getState());
    }

    if (this.props.ctx) {
      await this.props.ctx.answerCallbackQuery(
        await this.props.inlineLabelPrinter(this.props, this.getState())
      );
    }
  }

  public async render() {
    const props = this.props;
    const { textPrinter, inlineLabelPrinter } = props;
    const state = this.getState();

    const options = await this.getProperty('options');
    const inlineLabelPosition = await this.getProperty('inlineLabelPosition');

    const inlineLabelIdx = {
      center: Math.round(options.length / 2),
      left: 0,
      right: options.length,
      none: null,
    }[inlineLabelPosition];

    const buttons: InlineKeyboardButton[] = [];
    const inlineLabel = this.getButton(
      await inlineLabelPrinter(this.props, state),
      'n'
    );

    for (let idx = 0; idx <= options.length; idx++) {
      if (idx === inlineLabelIdx) {
        buttons.push(inlineLabel);
      }
      if (idx < options.length) {
        const { delta, label } = options[idx];
        buttons.push(this.getButton(label, 'a', delta));
      }
    }

    return {
      text: await textPrinter(this.props, state),
      keyboard: [buttons],
    };
  }
}