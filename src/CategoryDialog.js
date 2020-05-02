function openEditCategoryDialog (groupId, id, catElement) {
	
	$('#addCategoryDialog .modal-title').text('Edit Category');
	$('#addCategoryDialog [name="name"]').val(catElement.find('.cat-list-name').text ());

	$("#addCategoryForm [name='error']").css("display", "none");
	$("#addCategoryForm [name='error'] strong").text ("");

	$("#addCategoryDialog").modal ('show');

	$("#addCategoryForm").off('submit');
	$("#addCategoryForm").submit(function (event) {
		event.preventDefault();
		
		$("#addCategoryForm [name='error']").css("display", "none");
		$("#addCategoryForm [name='error'] strong").text ("");

		let cat = $('#addCategoryForm').serializeArray ();

		$.ajax ({
			url: "/groups/" + groupId + "/categories/" + id,
			headers:
			{
				"X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
			},
			contentType: "application/json",
			method: 'PATCH',
			data: JSON.stringify({ name: cat[0].value }),
		})
		.fail (function(jqXHR) {
			if (jqXHR.responseJSON.errors) {
				
				for (let error of jqXHR.responseJSON.errors) {
					$("#addCategoryForm [name='error']").css("display", "block");
					$("#addCategoryForm [name='error'] strong").text (error.message);
				}
			}
		})
		.done (function(response) {

			$(catElement.find('.cat-list-name')).text(response.name);
			$("#addCategoryDialog").modal ('hide');
		});
	});
	
	$("#addCategoryDialog [name='delete']")
		.css('visibility', 'visible')
		.on('click', function () {

			$("#addCategoryForm [name='error']").css("display", "none");
			$("#addCategoryForm [name='error'] strong").text ("");

			$.ajax ({
				url: "/groups/" + groupId + "/categories/" + id,
				headers:
				{
					"X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
				},
				contentType: "application/json",
				method: 'DELETE'
			})
			.fail (function(jqXHR) {
				if (jqXHR.responseJSON.errors) {
					
					for (let error of jqXHR.responseJSON.errors) {
						$("#addCategoryForm [name='error']").css("display", "block");
						$("#addCategoryForm [name='error'] strong").text (error.message);
					}
				}
			})
			.done (function(response) {
	
				$(catElement).remove ();
				$("#addCategoryDialog").modal ('hide');
			});
	});
}

export {openEditCategoryDialog}
