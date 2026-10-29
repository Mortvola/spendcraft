import { moneyCentsFromInteger, type MoneyCents } from '../common/moneyCents.js';

enum TokenType {
  NUMBER,
  OPERATOR,
  OPENPAREN,
  CLOSEPAREN,
  END,
}

interface Token {
  type: TokenType;
  value: string | number | null;
}

class Tokenizer {
  iterator: Iterator<string>;

  nextChar: IteratorResult<string>;

  constructor(equation: string) {
    this.iterator = equation[Symbol.iterator]();
    this.nextChar = this.iterator.next();
  }

  getNextToken(): Token {
    // Skip any leading white space
    while (this.nextChar.value === ' ' && !this.nextChar.done) {
      this.nextChar = this.iterator.next();
    }

    if (!this.nextChar.done) {
      switch (this.nextChar.value) {
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
        case '.': {
          let decimalCount = 0;

          if (this.nextChar.value === '.') {
            decimalCount += 1;
          }

          let { value } = this.nextChar;
          this.nextChar = this.iterator.next();

          // Read until we find a non-digit character
          while ((
            (this.nextChar.value >= '0' && this.nextChar.value <= '9')
              || this.nextChar.value === '.')
            && !this.nextChar.done
          ) {
            if (this.nextChar.value === '.') {
              decimalCount += 1;
              if (decimalCount > 1) {
                throw new Error('parsing error');
              }
            }
            value += this.nextChar.value;
            this.nextChar = this.iterator.next();
          }

          return {
            type: TokenType.NUMBER,
            value,
          };
        }

        case '*':
        case '/':
        case '+':
        case '-': {
          const { value } = this.nextChar;
          this.nextChar = this.iterator.next();

          return {
            type: TokenType.OPERATOR,
            value,
          };
        }

        case '(':
          this.nextChar = this.iterator.next();
          return {
            type: TokenType.OPENPAREN,
            value: '(',
          };

        case ')':
          this.nextChar = this.iterator.next();
          return {
            type: TokenType.CLOSEPAREN,
            value: ')',
          };

        default:
          throw new Error('parsing error');
      }
    }
    else {
      return {
        type: TokenType.END,
        value: null,
      };
    }
  }
}

interface Arithmetic<T> {
  literal: (value: string) => T;
  negate: (value: T) => T;
  binary: (operator: string, left: T, right: T) => T;
}

const evaluate = <T,>(equation: string, arithmetic: Arithmetic<T>): T => {
  const stack: string[] = [];
  const output: T[] = [];

  const applyOperator = (operator: string) => {
    if (typeof operator !== 'string') {
      throw new Error('invalid operator');
    }

    if (operator === 'UM') {
      if (output.length === 0) {
        throw new Error('parsing error');
      }

      const value = output.pop();
      if (value === undefined) {
        throw new Error('output stack is empty');
      }

      output.push(arithmetic.negate(value));
    }
    else {
      if (output.length < 2) {
        throw new Error('parsing error');
      }

      const value2 = output.pop();
      const value1 = output.pop();

      if (value1 === undefined || value2 === undefined) {
        throw new Error('output stack is empty');
      }

      output.push(arithmetic.binary(operator, value1, value2));
    }
  };

  const tokenizer = new Tokenizer(equation);

  let prevToken = null;

  for (;;) {
    const token = tokenizer.getNextToken();

    if (token.type === TokenType.END) {
      break;
    }

    switch (token.type) {
      case TokenType.NUMBER: {
        if (typeof token.value !== 'string') {
          throw new Error('non-numeric with token type of NUMBER');
        }

        output.push(arithmetic.literal(token.value));

        if (stack[stack.length - 1] === 'UM') {
          const value = stack.pop();

          if (typeof value !== 'string') {
            throw new Error('invalid token type');
          }

          applyOperator(value);
        }

        break;
      }

      case TokenType.OPERATOR:
        if (
          token.value === '-'
          && (
            prevToken === null
            || ![TokenType.NUMBER, TokenType.CLOSEPAREN].includes(prevToken.type)
          )
        ) {
          token.value = 'UM';
        }

        // As long as there is a higher precedence operator
        // on the stack, pop it off and apply it
        while ((token.value === '+' || token.value === '-')
          && stack.length > 0
          && stack[stack.length - 1] !== '('
          && (['+', '-', '*', '/'].includes(stack[stack.length - 1]))) {
          const value = stack.pop();
          if (value === undefined) {
            throw new Error('stack is empty');
          }

          applyOperator(value);
        }

        if (typeof token.value !== 'string') {
          throw new Error('token of wrong type');
        }

        stack.push(token.value);

        break;

      case TokenType.OPENPAREN:
        if (typeof token.value !== 'string') {
          throw new Error('token of wrong type');
        }

        stack.push(token.value);
        break;

      case TokenType.CLOSEPAREN:
        while (stack.length > 0 && stack[stack.length - 1] !== '(') {
          const value = stack.pop();
          if (value === undefined) {
            throw new Error('stack is empty');
          }

          applyOperator(value);
        }

        if (stack.length === 0) {
          throw new Error('parsing error');
        }

        stack.pop();

        if (stack.length > 0 && stack[stack.length - 1] === 'UM') {
          const value = stack.pop();
          if (value === undefined) {
            throw new Error('stack is empty');
          }

          applyOperator(value);
        }

        break;

      default:
        throw new Error('parsing error');
    }

    prevToken = token;
  }

  while (stack.length > 0) {
    const value = stack.pop();
    if (value === undefined) {
      throw new Error('stack is empty');
    }

    applyOperator(value);
  }

  if (output.length !== 1) {
    throw new Error('parsing error');
  }

  return output[0];
};

// Non-monetary inputs retain their existing numeric calculator behavior.
const parseEquation = (equation: string): number => evaluate(equation, {
  literal: value => parseFloat(value),
  negate: value => -value,
  binary: (operator, left, right) => {
    switch (operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      default: throw new Error('parsing error');
    }
  },
});

interface Fraction { numerator: bigint; denominator: bigint }

// Keep exact subcent intermediates for scalar multiplication/division; round only
// the completed monetary expression, with half ties toward positive infinity.
export function parseEquationCents(equation: string): MoneyCents {
  const result = evaluate<Fraction>(equation, {
    literal: value => {
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error('parsing error');
      const [whole, fraction = ''] = value.split('.');
      return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
    },
    negate: value => ({ ...value, numerator: -value.numerator }),
    binary: (operator, left, right) => {
      switch (operator) {
        case '+': return { numerator: left.numerator * right.denominator + right.numerator * left.denominator, denominator: left.denominator * right.denominator };
        case '-': return { numerator: left.numerator * right.denominator - right.numerator * left.denominator, denominator: left.denominator * right.denominator };
        case '*': return { numerator: left.numerator * right.numerator, denominator: left.denominator * right.denominator };
        case '/': {
          if (right.numerator === 0n) throw new Error('Division by zero');
          const sign = right.numerator < 0n ? -1n : 1n;
          return { numerator: sign * left.numerator * right.denominator, denominator: sign * left.denominator * right.numerator };
        }
        default: throw new Error('parsing error');
      }
    },
  });
  const scaled = result.numerator * 100n;
  let cents = scaled / result.denominator;
  const remainder = scaled % result.denominator;
  if (remainder > 0n && remainder * 2n >= result.denominator) cents += 1n;
  if (remainder < 0n && -remainder * 2n > result.denominator) cents -= 1n;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Unsafe monetary cents');
  return moneyCentsFromInteger(Number(cents));
}

export default parseEquation;
