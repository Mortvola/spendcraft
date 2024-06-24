import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { rules, schema } from '@ioc:Adonis/Core/Validator';
import AutoAssignment from 'App/Models/AutoAssignment';

export default class AutoAssignmentsController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    request,
  }: HttpContextContract): Promise<AutoAssignment | AutoAssignment[]> {
    const { id } = request.params();

    let assignment: AutoAssignment

    if (id) {
      assignment = await AutoAssignment.query()
        .where('id', id)
        .firstOrFail();

      await assignment.load('categories');
      await assignment.load('searchStrings');

      return assignment;
    }

    const assignments = await AutoAssignment.query()
      .preload('categories')
      .preload('searchStrings')

    return assignments;
  }

  // eslint-disable-next-line class-methods-use-this
  public async patch({
    request,
  }: HttpContextContract): Promise<AutoAssignment> {
    const { id } = request.params();
    const requestData = await request.validate({
      schema: schema.create({
        name: schema.string([rules.trim()]),
      }),
    });

    const autoAssignment = await AutoAssignment.findOrFail(id)

    autoAssignment.merge({
      name: requestData.name,
    })

    await autoAssignment.save();

    return autoAssignment;
  }
}
