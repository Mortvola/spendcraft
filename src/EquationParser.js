const NUMBER = 'NUMBER';
const OPERATOR = 'OPERATOR';
const OPENPAREN = 'OPENPAREN';
const CLOSEPAREN = 'CLOSEPAREN';
const END = 'END';

class Tokenizer {
  constructor(equation) {
    this.iterator = equation[Symbol.iterator]();
    this.nextChar = this.iterator.next();
  }

  getNextToken() {
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
            type: NUMBER,
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
            type: OPERATOR,
            value,
          };
        }

        case '(':
          this.nextChar = this.iterator.next();
          return {
            type: OPENPAREN,
            value: '(',
          };

        case ')':
          this.nextChar = this.iterator.next();
          return {
            type: CLOSEPAREN,
            value: ')',
          };

        default:
          throw new Error('parsing error');
      }
    }
    else {
      return {
        type: END,
        value: null,
      };
    }
  }
}

const parseEquation = (equation) => {
  const stack = [];
  const output = [];

  const applyOperator = (operator) => {
    if (operator === 'UM') {
      if (output.length === 0) {
        throw new Error('parsing error');
      }

      output.push(output.pop() * -1);
    }
    else {
      if (output.length < 2) {
        throw new Error('parsing error');
      }

      const value2 = output.pop();
      const value1 = output.pop();

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

    if (token.type === END) {
      break;
    }

    switch (token.type) {
      case NUMBER:
        output.push(token.value);

        if (stack[stack.length - 1] === 'UM') {
          applyOperator(stack.pop());
        }

        break;

      case OPERATOR:
        if (
          token.value === '-'
          && (
            prevToken === null
            || ![NUMBER, CLOSEPAREN].includes(prevToken.type)
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
          applyOperator(stack.pop());
        }

        stack.push(token.value);

        break;

      case OPENPAREN:
        stack.push(token.value);
        break;

      case CLOSEPAREN:
        while (stack.length > 0 && stack[stack.length - 1] !== '(') {
          applyOperator(stack.pop());
        }

        if (stack.length === 0) {
          throw new Error('parsing error');
        }

        stack.pop();

        if (stack.length > 0 && stack[stack.length - 1] === 'UM') {
          applyOperator(stack.pop());
        }

        break;

      default:
        throw new Error('parsing error');
    }

    prevToken = token;
  }

  while (stack.length > 0) {
    applyOperator(stack.pop());
  }

  if (output.length !== 1) {
    throw new Error('parsing error');
  }

  return output[0];
};

export default parseEquation;
