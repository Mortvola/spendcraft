import { useState, useEffect } from 'react';

const states = {};
let counter = 0;
let currentTrue = null;

const nextCounter = () => {
  counter += 1;
  // console.log(`counter: ${counter}`);
  return counter;
};

const setExclusiveBool = (id, boolState) => {
  if (states[id]) {
    if (boolState) {
      if (currentTrue !== null && currentTrue !== id) {
        if (states[currentTrue]
          && states[currentTrue].bool) {
          if (states[currentTrue].listener) {
            states[currentTrue].listener(false);
          }

          states[currentTrue].bool = false;
        }
      }

      if (!states[id].bool && states[id].listener) {
        states[id].listener(true);
      }

      currentTrue = id;
    }
    else {
      if (states[id].bool && states[id].listener) {
        states[id].listener(false);
      }

      if (currentTrue === id) {
        currentTrue = null;
      }
    }

    states[id].bool = boolState;
  }
};

const useExclusiveBool = (initialState) => {
  const [id] = useState(nextCounter());
  const [bool, listener] = useState(initialState);

  useEffect(() => {
    states[id] = {
      bool,
      mounted: true,
      listener,
    };

    // Remove from state object when unmounting
    return () => {
      delete states[id];
      if (id === currentTrue) {
        currentTrue = null;
      }
    };
  }, []);

  return [bool, (newBoolState) => {
    setExclusiveBool(id, newBoolState);
  }];
};

export default useExclusiveBool;
