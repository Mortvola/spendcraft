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
            value: parseFloat(value),
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

const parseEquation = (equation: string): number => {
  const stack: string[] = [];
  const output: number[] = [];

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

      output.push(value * -1);
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

      switch (operator) {
        case '*':
          output.push(value1 * value2);
          break;

        case '/':
          output.push(value1 / value2);
          break;

        case '+':
          output.push(value1 + value2);
          break;

        case '-':
          output.push(value1 - value2);
          break;

        default:
          throw new Error('parsing error');
      }
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
        if (typeof token.value !== 'number') {
          throw new Error('non-numeric with token type of NUMBER');
        }

        output.push(token.value);

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

export default parseEquation;
