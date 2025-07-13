import { useState, useEffect } from 'react';

interface BoolState {
  bool: boolean;
  mounted: boolean;
  listener: (state: boolean) => void;
}

const states: BoolState[] = [];
let counter = 0;
let currentTrue: number | null = null;

const nextCounter = () => {
  counter += 1;
  // console.log(`counter: ${counter}`);
  return counter;
};

const setExclusiveBool = (id: number, boolState: boolean) => {
  if (states[id]) {
    if (boolState) {
      if (currentTrue !== null && currentTrue !== id) {
        if (states[currentTrue]
          && states[currentTrue].bool) {
          states[currentTrue].listener(false);
          states[currentTrue].bool = false;
        }
      }

      if (!states[id].bool) {
        states[id].listener(true);
      }

      currentTrue = id;
    }
    else {
      if (states[id].bool) {
        states[id].listener(false);
      }

      if (currentTrue === id) {
        currentTrue = null;
      }
    }

    states[id].bool = boolState;
  }
};

const useExclusiveBool = (initialState: boolean): [boolean, (state: boolean) => void] => {
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
  }, [bool, id]);

  return [
    bool,
    (newBoolState: boolean) => {
      setExclusiveBool(id, newBoolState);
    },
  ];
};

export default useExclusiveBool;
