const submitForm = async (event, form, url, success, fail) => {
  const formData = new FormData(form);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
      Accept: 'application/json',
    },
    body: formData,
  });

  if (response.ok) {
    if (response.headers.get('Content-Type') === 'application/json') {
      const json = await response.json();
      success(json);
    }
  }
  else if (fail) {
    if (response.status === 422) {
      const json = await response.json();
      fail(json.errors);
    }
    else {
      fail({ general: ['An error occured. Please try again later.'] });
    }
  }

  if (event) {
    event.preventDefault();
  }
};

const defaultErrors = {
  username: [],
  password: [],
  email: [],
  general: [],
};

export { submitForm, defaultErrors };
