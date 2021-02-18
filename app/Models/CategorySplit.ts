import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm';

class CategorySplit extends BaseModel {
  @column()
  public categoryId: number;

  @column()
  public amount: number;
}

export default CategorySplit;
